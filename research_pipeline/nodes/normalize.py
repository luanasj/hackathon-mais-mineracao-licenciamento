"""Nó `normalize` — `LicencaBruta[]` -> `LicencaNormalizada[]` (§6.2 do GOAL.md).

Duas passadas. A **determinística** roda em toda linha: `RefIndex.match_municipio`/
`match_consorcio` (patch 6) e `substancia_raw` dobrada contra `build_substancia_index` (patch 4).
Acerto único de substância resolve a tipologia sem LLM; mais de um candidato é ambiguidade de
verdade (Granito, quartzito, e as outras onze do patch 4) e só se decide por *uso*, que não é uma
regra mecânica — vai para a passada de **LLM em lote único**, junto com toda linha cujo município
ficou `metodo="nenhum"` ou `ambiguo=True`. `licenciado_por` passa intocado do `extract`: este nó
não vê o relatório e não pode reavaliar o julgamento que já foi feito sobre quem assinou.

Os três cruzamentos do §6.2 (herança de consórcio cadastral, divergência, e consórcio inesperado
num município sem vínculo) rodam aqui, sobre o `municipio_id`/`consorcio_id` já resolvidos, e
nunca rejeitam linha — só produzem aviso. Isso **duplica**, de propósito, parte do que
`nodes/validate.py` (patch 7) também confere depois de o Pydantic validar o lote: a duplicação
existe porque `check_golden.py` verifica este nó isoladamente, antes de o grafo (patch 11) ligar
`normalize -> validate`, e o manifesto final (`build_manifest`, patch 10) já está desenhado para
deduplicar avisos repetidos entre nós, contando as ocorrências.

`id` (a chave humana de cada licença, ex. `"2025-caturama-lau-01"`) é atribuído **aqui**, não em
`nodes/emit.py` (patch 10): `validate_licencas` (patch 7) já exige `id` único por linha, e o
patch 10 ainda não existe. `_slug_licenca` é a mesma função que o `emit.py` do patch 10 vai
reaproveitar — o slug final não muda depois daqui, só o ranking e o manifesto são calculados lá.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from common.text import fold
from research_pipeline.llm import Structurer
from research_pipeline.matcher import Match, MatchingConfig, RefIndex, load_matching_config
from research_pipeline.refs import Municipio, ReferenceData
from research_pipeline.vocab import chave_substancia, substancias_ambiguas

__all__ = ["PROMPT_PATH", "normalize"]

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "normalize_v1.md"

_RUN_ID_RE = re.compile(r"_(\d{4})(\d{2})(\d{2})T")
_SEPARADOR_PALAVRA = re.compile(r"[\s,]+")


def _data_do_run(run_id: str) -> str:
    """`"2025_20260801T143200Z"` -> `"2026-08-01"`. Ver o docstring do módulo em `run.py` (§9):
    `data_consulta` da licença é a data do run, não a do snapshot do GAC."""
    achado = _RUN_ID_RE.search(run_id)
    if achado is None:
        raise ValueError(f"run_id {run_id!r} não traz timestamp AAAAMMDDT... reconhecível")
    return f"{achado.group(1)}-{achado.group(2)}-{achado.group(3)}"


def _slug_numero(numero_licenca: str | None) -> str:
    if numero_licenca is None:
        return "sn"
    primeiro = numero_licenca.split("/")[0].strip()
    limpo = re.sub(r"[^a-z0-9]+", "", fold(primeiro))
    return limpo or "sn"


def _slug_texto(texto: str) -> str:
    limpo = re.sub(r"[^a-z0-9\s-]", "", fold(texto))
    return re.sub(r"\s+", "-", limpo.strip()) or "sn"


def _slug_licenca(
    ano: int,
    municipio_nome: str | None,
    municipio_raw: str,
    modalidade: str | None,
    numero_licenca: str | None,
    contagem: dict[str, int],
) -> str:
    """`f"{ano}-{municipio}-{modalidade}-{numero}"`, com sufixo `-2`/`-3` determinístico em
    colisão. Cai em `municipio_raw` quando `municipio_id` é `None` — a mesma regra que
    `nodes/emit.py` (patch 10) vai herdar deste módulo."""
    municipio_slug = _slug_texto(municipio_nome or municipio_raw)
    modalidade_slug = modalidade.lower() if modalidade else "sm"
    base = f"{ano}-{municipio_slug}-{modalidade_slug}-{_slug_numero(numero_licenca)}"
    vistos = contagem.get(base, 0) + 1
    contagem[base] = vistos
    return base if vistos == 1 else f"{base}-{vistos}"


def _resolver_substancia(
    substancia_raw: str | None, indice: dict[str, tuple[str, ...]]
) -> tuple[str, ...]:
    """Chave dobrada, primeiro a frase inteira e depois palavra a palavra — a frase inteira casa
    frases compostas do SIGMINE (`"minério de ferro"`), a palavra isolada pega o núcleo da
    substância dentro de um texto descritivo mais longo (`"Granito para britagem/agregados"`)."""
    if not substancia_raw:
        return ()
    chave_frase = chave_substancia(substancia_raw)
    if chave_frase in indice:
        return indice[chave_frase]
    for palavra in _SEPARADOR_PALAVRA.split(substancia_raw):
        if not palavra:
            continue
        chave = chave_substancia(palavra)
        if chave in indice:
            return indice[chave]
    return ()


def _resolver_mineral(substancia_raw: str | None, indice_minerais: dict[str, str]) -> str | None:
    if not substancia_raw:
        return None
    chave_frase = chave_substancia(substancia_raw)
    if chave_frase in indice_minerais:
        return indice_minerais[chave_frase]
    for palavra in _SEPARADOR_PALAVRA.split(substancia_raw):
        if not palavra:
            continue
        chave = chave_substancia(palavra)
        if chave in indice_minerais:
            return indice_minerais[chave]
    return None


def _candidatos_json(match: Match) -> list[dict[str, Any]]:
    return [{"id": ident, "nome": nome, "score": round(score, 3)} for ident, nome, score in match.candidatos]


def _glossario_substancias_ambiguas(refs: ReferenceData) -> dict[str, list[dict[str, Any]]]:
    ambiguas = substancias_ambiguas(refs.indice_substancias)
    return {
        chave: [
            {
                "codigo": codigo,
                "nome": refs.tipologias[codigo].nome,
                "uso": refs.tipologias[codigo].uso,
            }
            for codigo in codigos
        ]
        for chave, codigos in sorted(ambiguas.items())
    }


def _payload_linha(
    indice: int,
    bruta: dict[str, Any],
    mm: Match,
    cm: Match | None,
    substancia_candidatos: tuple[str, ...],
    refs: ReferenceData,
) -> dict[str, Any]:
    item: dict[str, Any] = {"indice": indice, "municipio_raw": bruta["municipio_raw"]}
    if mm.metodo == "nenhum" or mm.ambiguo:
        item["candidatos_municipio"] = _candidatos_json(mm)
    if cm is not None and cm.ambiguo:
        item["consorcio_raw"] = bruta["consorcio_raw"]
        item["candidatos_consorcio"] = _candidatos_json(cm)
    if len(substancia_candidatos) > 1:
        item["substancia_raw"] = bruta["substancia_raw"]
        item["trecho_citado"] = bruta["trecho_citado"]
        item["tipologia_candidatos"] = [
            {
                "codigo": codigo,
                "nome": refs.tipologias[codigo].nome,
                "uso": refs.tipologias[codigo].uso,
            }
            for codigo in substancia_candidatos
        ]
    return item


def _consorcio_heranca(
    municipio: Municipio | None, config: MatchingConfig
) -> tuple[str | None, str | None, str, float]:
    """Sem `consorcio_raw` no relatório: herda o vínculo cadastral do município resolvido, nunca
    o `licenciado_por` (§6.2 regra 1). Sem município resolvido, não há de onde herdar."""
    if municipio is not None and municipio.consorcio_id is not None:
        return municipio.consorcio_id, municipio.consorcio_nome, "inferido", config.confianca_heranca
    return None, None, "nenhum", 0.0


def normalize(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"licencas_normalizadas": [...], "avisos": [...]}`."""
    refs: ReferenceData = config["configurable"]["refs"]
    ref_index: RefIndex = config["configurable"]["ref_index"]
    matching_config: MatchingConfig = config["configurable"].get("matching_config") or load_matching_config()
    structurer: Structurer = config["configurable"]["structurer"]

    ano = state["ano"]
    data_consulta = state.get("data_consulta") or _data_do_run(state["run_id"])
    brutas = state["licencas_brutas"]

    # Passada 1: determinística, em toda linha.
    contexto: list[dict[str, Any]] = []
    for bruta in brutas:
        mm = ref_index.match_municipio(bruta["municipio_raw"])
        cm = ref_index.match_consorcio(bruta["consorcio_raw"]) if bruta["consorcio_raw"] else None
        substancia_candidatos = _resolver_substancia(bruta["substancia_raw"], refs.indice_substancias)
        contexto.append(
            {
                "bruta": bruta,
                "mm": mm,
                "cm": cm,
                "substancia_candidatos": substancia_candidatos,
                "mineral": _resolver_mineral(bruta["substancia_raw"], refs.indice_minerais),
            }
        )

    ambiguos = [
        i
        for i, ctx in enumerate(contexto)
        if ctx["mm"].metodo == "nenhum"
        or ctx["mm"].ambiguo
        or (ctx["cm"] is not None and ctx["cm"].ambiguo)
        or len(ctx["substancia_candidatos"]) > 1
    ]

    resolucoes: dict[int, dict[str, Any]] = {}
    if ambiguos:
        payload = {
            "licencas_ambiguas": [
                _payload_linha(
                    i,
                    contexto[i]["bruta"],
                    contexto[i]["mm"],
                    contexto[i]["cm"],
                    contexto[i]["substancia_candidatos"],
                    refs,
                )
                for i in ambiguos
            ],
            "glossario_substancias_ambiguas": _glossario_substancias_ambiguas(refs),
        }
        system = PROMPT_PATH.read_text(encoding="utf-8")
        resposta = structurer.complete_json(
            system=system, user=json.dumps(payload, ensure_ascii=False), tag="normalize"
        )
        for item in resposta.get("resolucoes", []):
            resolucoes[item["indice"]] = item

    # Passada 2: aplica resoluções de LLM (quando houver) e os cruzamentos §6.2.
    normalizadas: list[dict[str, Any]] = []
    avisos: list[str] = []
    contagem_slug: dict[str, int] = {}

    for i, ctx in enumerate(contexto):
        bruta = ctx["bruta"]
        mm: Match = ctx["mm"]
        cm: Match | None = ctx["cm"]
        resolucao = resolucoes.get(i, {})

        municipio_id, municipio_nome = mm.id, mm.nome
        municipio_metodo, municipio_confianca = mm.metodo, mm.confianca
        municipio_obj = refs.municipios.get(municipio_id) if municipio_id else None

        candidato_llm = resolucao.get("municipio_id")
        if candidato_llm:
            municipio_obj = refs.municipios[candidato_llm]
            municipio_id, municipio_nome = municipio_obj.id, municipio_obj.nome
            municipio_metodo = "fuzzy"
            municipio_confianca = matching_config.confianca_alias

        if bruta["consorcio_raw"]:
            assert cm is not None
            consorcio_id, consorcio_nome = cm.id, cm.nome
            consorcio_metodo, consorcio_confianca = cm.metodo, cm.confianca
        else:
            consorcio_id, consorcio_nome, consorcio_metodo, consorcio_confianca = _consorcio_heranca(
                municipio_obj, matching_config
            )

        substancia_candidatos = ctx["substancia_candidatos"]
        tipologia_codigo = substancia_candidatos[0] if len(substancia_candidatos) == 1 else None
        if tipologia_codigo is None and resolucao.get("tipologia_codigo"):
            tipologia_codigo = resolucao["tipologia_codigo"]
        tipologia = refs.tipologias.get(tipologia_codigo) if tipologia_codigo else None

        id_licenca = _slug_licenca(
            ano, municipio_nome, bruta["municipio_raw"], bruta["modalidade"], bruta["numero_licenca"], contagem_slug
        )

        if municipio_id is None:
            avisos.append(f"municipio_nao_resolvido:{id_licenca}:{bruta['municipio_raw']}")
        if consorcio_id is not None and municipio_obj is not None:
            if municipio_obj.consorcio_id is None:
                avisos.append(f"consorcio_inesperado:{id_licenca}:{consorcio_id}")
            elif municipio_obj.consorcio_id != consorcio_id:
                avisos.append(
                    f"consorcio_divergente:{id_licenca}:{consorcio_id}!={municipio_obj.consorcio_id}"
                )

        normalizadas.append(
            {
                "id": id_licenca,
                "municipio_id": municipio_id,
                "municipio_nome": municipio_nome,
                "municipio_raw": bruta["municipio_raw"],
                "municipio_match_metodo": municipio_metodo,
                "municipio_match_confianca": municipio_confianca,
                "consorcio_id": consorcio_id,
                "consorcio_nome": consorcio_nome,
                "consorcio_raw": bruta["consorcio_raw"],
                "consorcio_match_metodo": consorcio_metodo,
                "consorcio_match_confianca": consorcio_confianca,
                "licenciado_por": bruta["licenciado_por_raw"],
                "orgao_emissor_raw": bruta["orgao_emissor_raw"],
                "licenciado_por_evidencia": bruta["licenciado_por_evidencia"],
                "licenciado_por_confianca": bruta["licenciado_por_confianca"],
                "titular": bruta["titular"],
                "mineral": ctx["mineral"],
                "substancia_raw": bruta["substancia_raw"],
                "tipologia_codigo": tipologia_codigo,
                "tipologia_nome": tipologia.nome if tipologia else None,
                "potencial_poluidor": tipologia.potencial_poluidor if tipologia else None,
                "nivel_licenciamento": bruta["nivel_licenciamento"],
                "modalidade": bruta["modalidade"],
                "modalidade_raw": bruta["modalidade_raw"],
                "numero_licenca": bruta["numero_licenca"],
                "data_concessao": bruta["data_concessao"],
                "fonte_urls": bruta["fonte_urls"],
                "trecho_citado": bruta["trecho_citado"],
                "data_consulta": data_consulta,
                "verificado": False,
            }
        )

    return {"licencas_normalizadas": normalizadas, "avisos": avisos}
