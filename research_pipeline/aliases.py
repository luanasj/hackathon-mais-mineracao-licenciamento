"""Derivação mecânica de aliases — a camada que faz `CONSORCIO` casar com `Consórcio`.

Funções puras, sem I/O (`load_overrides` é a única exceção, e só lê um YAML de overrides
manuais). Nada aqui decide *match* — isso é o patch 6. Aqui só se deriva, a partir do nome cru,
o conjunto de grafias que um mesmo município ou consórcio pode assumir em texto de terceiro.

Duas armadilhas medidas contra os 29 consórcios reais:

1. **A sigla sai do nome CRU, nunca do dobrado.** O separador (`" - "`, ou o mojibake `\\x96` de
   `CISUDOESTE`) e o segmento seguinte só existem enquanto a caixa alta sobrevive — `fold()`
   destrói a distinção entre `CIMA` (sigla) e `cima` (dobra de qualquer coisa). Por isso
   `derive_consorcio_aliases` particiona o nome **antes** de dobrar.
2. **`GOAL.md` §7.2 registra o motivo do alias errado.** Não é divergência GAC × IBGE — as duas
   fontes escrevem `Santa Terezinha`, com z (medido no patch 3, 0 divergências nos 417). O
   `ALIASES` de `scripts/lib/municipios_ba.py:67` é alias para a grafia com **s** que aparece em
   texto de terceiro, não correção entre fontes. Migrado (copiado, não removido) para
   `config/aliases.yaml`.

A cascata de prefixos genéricos (`PREFIXOS_FRENTE`) existe porque os 29 nomes de consórcio são
quase todos `"CONSORCIO [PÚBLICO] [INTERMUNICIPAL] DE DESENVOLVIMENTO SUSTENTÁVEL DO TERRITÓRIO
[DE IDENTIDADE] DO/DA <o que importa> [DA BAHIA]"` — o boilerplate é ruído para o matcher e
`chave_curta` é o que sobra depois de descascar, na ordem em que o boilerplate aparece.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from common.text import fold
from research_pipeline.errors import RefLoadError

ALIASES_PATH = Path(__file__).resolve().parent / "config" / "aliases.yaml"

SEPARADOR_SIGLA = re.compile(r"\s+[-–—\x96\x97]\s+")
"""Separador nome-completo/sigla. Inclui `\\x96`: `CISUDOESTE` traz literalmente
`'CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \\x96 CISUDOESTE'`, en-dash mojibake de cp1252
(ver `common/text.py`, que trata o mesmo caractere do lado do nome, não da sigla)."""

_SIGLA_RE = re.compile(r"[A-Z]+")
"""Sigla é um único token em caixa alta. Segmento com espaço, minúscula ou dígito não é sigla —
é nome que por acaso tem um hífen, e o nome inteiro entra como base, sem partição."""

_CONECTIVOS_MUNICIPIO = frozenset({"de", "do", "da", "d"})
"""Removidos na variante sem conectivo. `"d"` fica de defesa: depois de `fold()` o apóstrofo de
`Dias d'Ávila` já virou `"dias davila"` sem espaço, então nunca sobra como token isolado — mas
custa nada blindar contra uma fonte futura que escreva `"Dias D Ávila"` com espaço."""

PREFIXOS_FRENTE = (
    r"^consorcio\s+",
    r"^(?:publico|interfederativo)\s+",
    r"^intermunicipal\s+",
    r"^de\s+desenvolvimento\s+sustentavel\s+",
    r"^sustentavel\s+",
    r"^de\s+infra\s*estrutura\s+",
    r"^do\s+territorio\s+",
    r"^de\s+identidade\s+",
    r"^de\s+",
    r"^do\s+",
)
"""Cascata ORDENADA de grupos opcionais, aplicada à frente do nome já dobrado. Cada padrão é
tentado uma vez, na ordem; casar ou não, a cascata segue para o próximo. A ordem importa: `"do
territorio"` tem de ser tentado antes do `"do"` solto, senão o `"do"` solto consome metade da
frase e `"territorio"` sobra como se fosse parte do nome que importa.

Nenhum item para `"da"` solto — só aparece como prefixo composto (`"da bahia"`, no sufixo) ou como
parte do nome (`"da costa do descobrimento"`), nunca como boilerplate isolado nos 29 nomes reais.
"""

SUFIXO_TRASEIRO = re.compile(r"\s+(?:da\s+bahia|baiano)$")
"""Sufixo geográfico genérico, descascado do fim depois da cascata da frente."""


def derive_municipio_aliases(nome: str) -> frozenset[str]:
    """`{fold(nome)}` mais a variante sem conectivo (`de`/`do`/`da`), quando ela difere.

    >>> derive_municipio_aliases("Barra do Choça") == frozenset({"barra do choca", "barra choca"})
    True
    >>> derive_municipio_aliases("Conde")
    frozenset({'conde'})
    """
    dobrado = fold(nome)
    sem_conectivo = " ".join(t for t in dobrado.split() if t not in _CONECTIVOS_MUNICIPIO)
    if sem_conectivo and sem_conectivo != dobrado:
        return frozenset({dobrado, sem_conectivo})
    return frozenset({dobrado})


def _particionar_sigla(nome: str) -> tuple[str, str | None]:
    """Nome cru -> (base sem sigla, sigla|None). Ver o achado 1 do docstring do módulo."""
    ocorrencias = list(SEPARADOR_SIGLA.finditer(nome))
    if not ocorrencias:
        return nome, None
    ultima = ocorrencias[-1]
    candidata = nome[ultima.end() :].strip()
    if _SIGLA_RE.fullmatch(candidata):
        return nome[: ultima.start()].rstrip(), candidata
    return nome, None


def _chave_curta(folded: str) -> str | None:
    """`None` quando a cascata não descasca nada — `folded` já seria a chave, redundante com ela
    mesma no conjunto de aliases, e por isso não vale a pena guardar de novo."""
    resultado = folded
    for padrao in PREFIXOS_FRENTE:
        resultado = re.sub(padrao, "", resultado, count=1)
    resultado = SUFIXO_TRASEIRO.sub("", resultado, count=1).strip()
    return resultado if resultado and resultado != folded else None


@dataclass(frozen=True, slots=True)
class ConsorcioAliases:
    """`folded` é o nome (sem sigla) dobrado inteiro; `chave_curta` é o que sobra sem o
    boilerplate; `tokens` é `folded` partido em palavras, para o pré-filtro `token_set_ratio` do
    patch 6."""

    folded: str
    sigla: str | None
    chave_curta: str | None
    tokens: frozenset[str]


def derive_consorcio_aliases(nome: str) -> ConsorcioAliases:
    base, sigla = _particionar_sigla(nome)
    folded = fold(base)
    return ConsorcioAliases(
        folded=folded,
        sigla=sigla,
        chave_curta=_chave_curta(folded),
        tokens=frozenset(folded.split()),
    )


@dataclass(frozen=True, slots=True)
class ConsorcioOverride:
    sigla: str | None
    aliases: frozenset[str]


@dataclass(frozen=True, slots=True)
class AliasOverrides:
    """Overrides manuais de `config/aliases.yaml`. Vazio nos dois blocos é o caso comum — cresce
    só quando o patch 6 medir uma colisão real que a derivação mecânica não resolve."""

    municipios: dict[str, frozenset[str]]
    consorcios: dict[str, ConsorcioOverride]


def load_overrides(path: Path = ALIASES_PATH) -> AliasOverrides:
    try:
        bruto = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as erro:
        raise RefLoadError(f"{path}: overrides de alias ausentes") from erro
    except yaml.YAMLError as erro:
        raise RefLoadError(f"{path}: YAML inválido ({erro})") from erro
    if not isinstance(bruto, dict):
        raise RefLoadError(f"{path}: esperado mapeamento no topo, veio {type(bruto).__name__}")

    municipios_brutos = bruto.get("municipios") or {}
    if not isinstance(municipios_brutos, dict):
        raise RefLoadError(f"{path}: bloco `municipios` deve ser mapeamento código -> lista")
    municipios: dict[str, frozenset[str]] = {}
    for codigo, valores in municipios_brutos.items():
        if not isinstance(valores, list) or not all(isinstance(v, str) for v in valores):
            raise RefLoadError(f"{path}: municipios[{codigo!r}] deve ser lista de strings")
        municipios[str(codigo)] = frozenset(fold(v) for v in valores)

    consorcios_brutos = bruto.get("consorcios") or {}
    if not isinstance(consorcios_brutos, dict):
        raise RefLoadError(
            f"{path}: bloco `consorcios` deve ser mapeamento id -> {{sigla, aliases}}"
        )
    consorcios: dict[str, ConsorcioOverride] = {}
    for codigo, registro in consorcios_brutos.items():
        if not isinstance(registro, dict):
            raise RefLoadError(f"{path}: consorcios[{codigo!r}] deve ser objeto")
        sigla = registro.get("sigla")
        if sigla is not None and not isinstance(sigla, str):
            raise RefLoadError(f"{path}: consorcios[{codigo!r}].sigla deve ser string ou null")
        aliases_brutos = registro.get("aliases") or []
        if not isinstance(aliases_brutos, list) or not all(
            isinstance(v, str) for v in aliases_brutos
        ):
            raise RefLoadError(f"{path}: consorcios[{codigo!r}].aliases deve ser lista de strings")
        consorcios[str(codigo)] = ConsorcioOverride(
            sigla=sigla, aliases=frozenset(fold(v) for v in aliases_brutos)
        )

    return AliasOverrides(municipios=municipios, consorcios=consorcios)


if __name__ == "__main__":
    from research_pipeline.refs import load_reference_data

    refs = load_reference_data()
    com_sigla = 0
    print(f"{'id':<8} {'sigla':<12} {'chave_curta':<28} nome")
    for consorcio_id in sorted(refs.consorcios, key=int):
        consorcio = refs.consorcios[consorcio_id]
        aliases = derive_consorcio_aliases(consorcio.nome)
        com_sigla += aliases.sigla is not None
        print(
            f"{consorcio_id:<8} {aliases.sigla or '':<12} "
            f"{aliases.chave_curta or '':<28} {consorcio.nome}"
        )
    print(f"{com_sigla} de {len(refs.consorcios)} consórcios com sigla")
