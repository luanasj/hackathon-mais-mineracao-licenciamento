"""Testa o payload que `normalize` monta para o LLM (patch 9) — parte pura, decisão D: usa `refs`
reais (o carregamento é rápido e determinístico, ver `refs.py`), mas não toca a fixture semente
nem o golden — isso é `check_golden.py normalize`.

Cobre só a guarda mecânica que o §6.2 exige: o prompt de normalização recebe **candidatos**, nunca
a lista inteira de 417 municípios/29 consórcios. Sem este teste, reintroduzir a lista canônica
no payload (por exemplo, "para ajudar o LLM") passaria despercebido até inflar o custo real.
"""

from __future__ import annotations

from typing import Any

import pytest

from common.text import fold
from research_pipeline.aliases import load_overrides
from research_pipeline.matcher import build_ref_index, load_matching_config
from research_pipeline.nodes.normalize import PROMPT_PATH, normalize
from research_pipeline.refs import ReferenceData, load_reference_data

_LIMITE_NOMES = 20
"""Bem acima dos poucos candidatos (top-5) de uma linha genuinamente ambígua, bem abaixo dos 417."""


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


class _RegistraPayload:
    """Devolve lote vazio de resoluções — só existe para capturar o `user` enviado."""

    def __init__(self) -> None:
        self.user: str | None = None

    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict[str, Any]:
        self.user = user
        return {"resolucoes": []}


def _bruta(municipio_raw: str, substancia_raw: str | None) -> dict[str, Any]:
    return {
        "municipio_raw": municipio_raw,
        "consorcio_raw": None,
        "orgao_emissor_raw": None,
        "licenciado_por_raw": "indeterminado",
        "licenciado_por_evidencia": None,
        "licenciado_por_confianca": 0.1,
        "titular": None,
        "substancia_raw": substancia_raw,
        "tipologia_raw": None,
        "nivel_licenciamento": None,
        "modalidade": None,
        "numero_licenca": None,
        "data_concessao": None,
        "fonte_urls": ["https://exemplo.invalid/x"],
        "trecho_citado": "trecho",
    }


def test_prompt_path_existe() -> None:
    assert PROMPT_PATH.exists()


def test_payload_nao_vaza_a_lista_inteira_de_municipios(refs: ReferenceData) -> None:
    overrides = load_overrides()
    matching_config = load_matching_config()
    ref_index = build_ref_index(refs, overrides, matching_config)

    brutas = [
        _bruta("Bacia do Paramirim (Região)", "diversos"),  # município: metodo="nenhum"
        _bruta("Caturama", "Granito para britagem/agregados"),  # substância ambígua
    ]
    state = {"ano": 2025, "run_id": "2025_20260101T000000Z", "licencas_brutas": brutas}
    registrador = _RegistraPayload()
    config = {
        "configurable": {
            "refs": refs,
            "ref_index": ref_index,
            "matching_config": matching_config,
            "structurer": registrador,
        }
    }

    normalize(state, config)

    assert registrador.user is not None
    nomes_dobrados = {fold(m.nome) for m in refs.municipios.values()}
    presentes = sum(1 for nome in nomes_dobrados if nome in registrador.user)
    assert presentes < _LIMITE_NOMES


def test_linha_sem_ambiguidade_nao_chama_o_estruturador(refs: ReferenceData) -> None:
    overrides = load_overrides()
    matching_config = load_matching_config()
    ref_index = build_ref_index(refs, overrides, matching_config)

    brutas = [_bruta("Caturama", "areia")]  # município exato, substância única
    state = {"ano": 2025, "run_id": "2025_20260101T000000Z", "licencas_brutas": brutas}
    registrador = _RegistraPayload()
    config = {
        "configurable": {
            "refs": refs,
            "ref_index": ref_index,
            "matching_config": matching_config,
            "structurer": registrador,
        }
    }

    normalize(state, config)

    assert registrador.user is None


def test_colisao_de_slug_recebe_sufixo_deterministico(refs: ReferenceData) -> None:
    """Patch 10 previa este teste em `test_emit.py`, mas o slug é atribuído em `normalize.py`
    (achado de escopo do patch 9): duas licenças de Caturama, mesma modalidade e mesmo número
    (o caso real seria dois registros distintos citando o mesmo processo) colidem no mesmo
    `id` base e recebem sufixo `-2` determinístico, nunca um erro nem um `id` repetido."""
    overrides = load_overrides()
    matching_config = load_matching_config()
    ref_index = build_ref_index(refs, overrides, matching_config)

    brutas = [
        _bruta("Caturama", "areia") | {"modalidade": "LAU", "numero_licenca": "01/2025"},
        _bruta("Caturama", "areia") | {"modalidade": "LAU", "numero_licenca": "01/2025"},
    ]
    state = {"ano": 2025, "run_id": "2025_20260101T000000Z", "licencas_brutas": brutas}
    config = {
        "configurable": {
            "refs": refs,
            "ref_index": ref_index,
            "matching_config": matching_config,
            "structurer": _RegistraPayload(),
        }
    }

    resultado = normalize(state, config)
    ids = [linha["id"] for linha in resultado["licencas_normalizadas"]]
    assert ids[0] == "2025-caturama-lau-01"
    assert ids[1] == "2025-caturama-lau-01-2"
