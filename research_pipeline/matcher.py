"""Matcher determinístico — o pré-filtro barato que resolve nome a id sem nenhum LLM.

Três métodos, nesta ordem estrita, o primeiro que casar decide:

1. **`exato`** — `fold(raw)` bate literalmente com `fold(nome oficial)`.
2. **`alias`** — `fold(raw)` bate com uma grafia derivada mecanicamente (patch 5:
   `derive_municipio_aliases` / `derive_consorcio_aliases`) ou com um override de
   `config/aliases.yaml`. Para consórcio isto cobre tanto a sigla (`"CIVALERG"`) quanto o nome
   sem o boilerplate genérico (`"Consórcio Bacia do Paramirim"` → `chave_curta` "bacia do
   paramirim", igual à do nome oficial) — ambos são derivação mecânica, não achado do fuzzy.
3. **`fuzzy`** — nenhum dos dois acima casou; `rapidfuzz` contra os 417 ou 29 nomes oficiais.

**Decisão 16 (piso só no município):** fuzzy de município abaixo de `municipio_fuzzy_minimo`
devolve `id=None`, `nome=None`, `metodo="nenhum"` — mas `candidatos` continua populado, para que
quem loga o aviso `municipio_nao_resolvido` veja contra o que o fuzzy chegou perto.
**Decisão 4 (consórcio sempre recebe o mais próximo):** `consorcio_fuzzy_minimo` é `0.0` — não
filtra nada, só existe no config por simetria com o do município.

`candidatos` é sempre o top-5, nunca a lista inteira de 417/29 — é o que o LLM desempatador do
patch 9 recebe quando `ambiguo=True`, e nada além disso deve vazar para um prompt.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml
from rapidfuzz import fuzz

from common.text import fold
from research_pipeline.aliases import (
    AliasOverrides,
    derive_consorcio_aliases,
    derive_municipio_aliases,
)
from research_pipeline.errors import RefLoadError
from research_pipeline.refs import Consorcio, Municipio, ReferenceData

MATCHING_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "matching.yaml"

_CAMPOS_CONFIG = (
    "confianca_exato",
    "confianca_alias",
    "municipio_fuzzy_minimo",
    "consorcio_fuzzy_minimo",
    "fuzzy_delta_ambiguidade",
    "confianca_aviso",
    "confianca_heranca",
)

MetodoMatch = Literal["exato", "alias", "fuzzy", "inferido", "nenhum"]
"""`"inferido"` não é produzido por este módulo — é o método da herança de consórcio cadastral
(decisão 15, patch 9). Faz parte do tipo aqui porque `Match.metodo` é o mesmo campo nos dois
lugares."""


@dataclass(frozen=True, slots=True)
class MatchingConfig:
    confianca_exato: float
    confianca_alias: float
    municipio_fuzzy_minimo: float
    consorcio_fuzzy_minimo: float
    fuzzy_delta_ambiguidade: float
    confianca_aviso: float
    confianca_heranca: float


def load_matching_config(path: Path = MATCHING_CONFIG_PATH) -> MatchingConfig:
    try:
        bruto = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as erro:
        raise RefLoadError(f"{path}: configuração de matching ausente") from erro
    except yaml.YAMLError as erro:
        raise RefLoadError(f"{path}: YAML inválido ({erro})") from erro
    if not isinstance(bruto, dict):
        raise RefLoadError(f"{path}: esperado mapeamento no topo, veio {type(bruto).__name__}")

    valores: dict[str, float] = {}
    for campo in _CAMPOS_CONFIG:
        if campo not in bruto:
            raise RefLoadError(f"{path}: campo {campo!r} ausente")
        valor = bruto[campo]
        if not isinstance(valor, (int, float)) or isinstance(valor, bool):
            raise RefLoadError(f"{path}: campo {campo!r} deve ser número, veio {valor!r}")
        valores[campo] = float(valor)
    return MatchingConfig(**valores)


@dataclass(frozen=True, slots=True)
class Match:
    """`candidatos` é `(id, nome, score)` do top-5, score em `[0, 1]`, ordem decrescente."""

    id: str | None
    nome: str | None
    metodo: MetodoMatch
    confianca: float
    raw: str
    ambiguo: bool
    candidatos: tuple[tuple[str, str, float], ...]


@dataclass(frozen=True, slots=True)
class _MunicipioIndexado:
    municipio: Municipio
    folded: str
    aliases: frozenset[str]


@dataclass(frozen=True, slots=True)
class _ConsorcioIndexado:
    consorcio: Consorcio
    folded: str
    aliases: frozenset[str]
    """Sigla dobrada, `chave_curta` (quando existir) e overrides — tudo que decide `alias`
    sem ambiguidade de score, porque cada elemento é uma string exata a bater."""


def _indexar_municipio(municipio: Municipio, overrides: AliasOverrides) -> _MunicipioIndexado:
    aliases = derive_municipio_aliases(municipio.nome)
    aliases |= overrides.municipios.get(municipio.id, frozenset())
    return _MunicipioIndexado(municipio=municipio, folded=fold(municipio.nome), aliases=aliases)


def _indexar_consorcio(consorcio: Consorcio, overrides: AliasOverrides) -> _ConsorcioIndexado:
    derivados = derive_consorcio_aliases(consorcio.nome)
    override = overrides.consorcios.get(consorcio.id)

    aliases: set[str] = set()
    sigla = derivados.sigla
    if override is not None and override.sigla is not None:
        sigla = override.sigla
    if sigla is not None:
        aliases.add(fold(sigla))
    if derivados.chave_curta is not None:
        aliases.add(derivados.chave_curta)
    if override is not None:
        aliases |= override.aliases

    return _ConsorcioIndexado(
        consorcio=consorcio, folded=derivados.folded, aliases=frozenset(aliases)
    )


def _melhores_candidatos(
    raw_folded: str, nomes_por_id: dict[str, tuple[str, str]], pontuar
) -> tuple[tuple[str, str, float], ...]:
    pontuados = [
        (ident, nome, pontuar(raw_folded, folded)) for ident, (nome, folded) in nomes_por_id.items()
    ]
    pontuados.sort(key=lambda c: c[2], reverse=True)
    return tuple(pontuados[:5])


def _score_municipio(a: str, b: str) -> float:
    return 0.5 * (fuzz.ratio(a, b) + fuzz.token_sort_ratio(a, b)) / 100


def _score_consorcio(a: str, b: str) -> float:
    return max(fuzz.token_set_ratio(a, b), fuzz.WRatio(a, b)) / 100


@dataclass(frozen=True, slots=True)
class RefIndex:
    """Índice pronto para casar — construído uma vez por `ReferenceData`, consultado por linha."""

    config: MatchingConfig
    _municipios: tuple[_MunicipioIndexado, ...]
    _consorcios: tuple[_ConsorcioIndexado, ...]

    def match_municipio(self, raw: str) -> Match:
        dobrado = fold(raw)

        for item in self._municipios:
            if dobrado == item.folded:
                return Match(
                    id=item.municipio.id,
                    nome=item.municipio.nome,
                    metodo="exato",
                    confianca=self.config.confianca_exato,
                    raw=raw,
                    ambiguo=False,
                    candidatos=((item.municipio.id, item.municipio.nome, 1.0),),
                )

        for item in self._municipios:
            if dobrado in item.aliases:
                return Match(
                    id=item.municipio.id,
                    nome=item.municipio.nome,
                    metodo="alias",
                    confianca=self.config.confianca_alias,
                    raw=raw,
                    ambiguo=False,
                    candidatos=((item.municipio.id, item.municipio.nome, self.config.confianca_alias),),
                )

        nomes_por_id = {item.municipio.id: (item.municipio.nome, item.folded) for item in self._municipios}
        candidatos = _melhores_candidatos(dobrado, nomes_por_id, _score_municipio)
        ambiguo = len(candidatos) > 1 and (
            candidatos[0][2] - candidatos[1][2] < self.config.fuzzy_delta_ambiguidade
        )
        melhor_id, melhor_nome, melhor_score = candidatos[0]

        if melhor_score < self.config.municipio_fuzzy_minimo:
            return Match(
                id=None,
                nome=None,
                metodo="nenhum",
                confianca=melhor_score,
                raw=raw,
                ambiguo=ambiguo,
                candidatos=candidatos,
            )
        return Match(
            id=melhor_id,
            nome=melhor_nome,
            metodo="fuzzy",
            confianca=melhor_score,
            raw=raw,
            ambiguo=ambiguo,
            candidatos=candidatos,
        )

    def match_consorcio(self, raw: str) -> Match:
        # `raw` pode trazer a sigla colada (`"... - COTEMESB"`, o próprio nome oficial em
        # `consorcios.json`): particiona ANTES de comparar, senão o nome oficial inteiro não
        # bateria consigo mesmo (`item.folded` já está sem sigla) e cairia em `alias` em vez de
        # `exato`. `query.folded` é `fold(raw)` quando não há sigla a particionar.
        query = derive_consorcio_aliases(raw)

        for item in self._consorcios:
            if query.folded == item.folded:
                return Match(
                    id=item.consorcio.id,
                    nome=item.consorcio.nome,
                    metodo="exato",
                    confianca=self.config.confianca_exato,
                    raw=raw,
                    ambiguo=False,
                    candidatos=((item.consorcio.id, item.consorcio.nome, 1.0),),
                )

        candidatas_alias = {query.folded}
        if query.chave_curta is not None:
            candidatas_alias.add(query.chave_curta)
        if query.sigla is not None:
            candidatas_alias.add(fold(query.sigla))
        for item in self._consorcios:
            if item.aliases & candidatas_alias:
                return Match(
                    id=item.consorcio.id,
                    nome=item.consorcio.nome,
                    metodo="alias",
                    confianca=self.config.confianca_alias,
                    raw=raw,
                    ambiguo=False,
                    candidatos=((item.consorcio.id, item.consorcio.nome, self.config.confianca_alias),),
                )

        nomes_por_id = {item.consorcio.id: (item.consorcio.nome, item.folded) for item in self._consorcios}
        candidatos = _melhores_candidatos(query.folded, nomes_por_id, _score_consorcio)
        ambiguo = len(candidatos) > 1 and (
            candidatos[0][2] - candidatos[1][2] < self.config.fuzzy_delta_ambiguidade
        )
        melhor_id, melhor_nome, melhor_score = candidatos[0]
        # Decisão 4: consórcio nunca vira `nenhum`. `consorcio_fuzzy_minimo` (0.0) não filtra.
        return Match(
            id=melhor_id,
            nome=melhor_nome,
            metodo="fuzzy",
            confianca=melhor_score,
            raw=raw,
            ambiguo=ambiguo,
            candidatos=candidatos,
        )


def build_ref_index(refs: ReferenceData, overrides: AliasOverrides, config: MatchingConfig) -> RefIndex:
    municipios = tuple(_indexar_municipio(m, overrides) for m in refs.municipios.values())
    consorcios = tuple(_indexar_consorcio(c, overrides) for c in refs.consorcios.values())
    return RefIndex(config=config, _municipios=municipios, _consorcios=consorcios)


if __name__ == "__main__":
    from research_pipeline.aliases import load_overrides
    from research_pipeline.refs import load_reference_data

    refs = load_reference_data()
    overrides = load_overrides()
    config = load_matching_config()
    index = build_ref_index(refs, overrides, config)

    for id_, m in refs.municipios.items():
        r = index.match_municipio(m.nome)
        assert r.metodo == "exato" and r.id == id_, (id_, r)
    for id_, c in refs.consorcios.items():
        r = index.match_consorcio(c.nome)
        assert r.metodo == "exato" and r.id == id_, (id_, r)
    print(f"{len(refs.municipios)} municípios e {len(refs.consorcios)} consórcios: exato em 100%")

    consorcios_de_teste = ("CIVALERG", "Consórcio Bacia do Paramirim")
    municipios_de_teste = ("Santa Teresinha", "Caetité", "Caitite")
    for raw in consorcios_de_teste:
        alvo = index.match_consorcio(raw)
        print(f"{raw!r:35} -> id={alvo.id} metodo={alvo.metodo} confianca={alvo.confianca:.3f} ambiguo={alvo.ambiguo}")
    for raw in municipios_de_teste:
        alvo = index.match_municipio(raw)
        print(f"{raw!r:35} -> id={alvo.id} metodo={alvo.metodo} confianca={alvo.confianca:.3f} ambiguo={alvo.ambiguo}")
