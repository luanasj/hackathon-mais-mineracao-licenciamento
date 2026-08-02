"""Testa o nó `extract` (patch 8) com um `Structurer` fake em memória — sem tocar disco além de
`PROMPT_PATH`, sem golden. A verificação de ponta a ponta contra a fixture semente é
`check_golden.py` (decisão D); aqui só a lógica de acumulação e a montagem do retorno.
"""

from __future__ import annotations

from typing import Any

from research_pipeline.nodes.extract import PROMPT_PATH, extract

LICENCA_VALIDA = {
    "municipio_raw": "Caturama",
    "consorcio_raw": None,
    "orgao_emissor_raw": None,
    "licenciado_por_raw": "indeterminado",
    "licenciado_por_evidencia": None,
    "licenciado_por_confianca": 0.5,
    "titular": None,
    "substancia_raw": "areia",
    "tipologia_raw": None,
    "nivel_licenciamento": None,
    "modalidade": None,
    "numero_licenca": None,
    "data_concessao": None,
    "fonte_urls": ["https://exemplo.invalid/x"],
    "trecho_citado": "trecho",
}


class _FakeStructurer:
    """Devolve `resposta` fixo, sem ler nada de disco. Guarda os argumentos recebidos."""

    def __init__(self, resposta: dict[str, Any]) -> None:
        self.resposta = resposta
        self.chamadas: list[dict[str, Any]] = []

    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict[str, Any]:
        self.chamadas.append({"system": system, "user": user, "tag": tag, "case": case})
        return self.resposta


def _extrair(resposta: dict[str, Any]) -> tuple[dict[str, Any], _FakeStructurer]:
    estruturador = _FakeStructurer(resposta)
    state = {"raw_report": "relatório de teste"}
    config = {"configurable": {"structurer": estruturador}}
    return extract(state, config), estruturador


def test_linha_valida_passa() -> None:
    resultado, _ = _extrair({"licencas": [LICENCA_VALIDA]})

    assert resultado["validation_errors"] == []
    assert len(resultado["licencas_brutas"]) == 1
    assert resultado["licencas_brutas"][0]["municipio_raw"] == "Caturama"


def test_linha_invalida_nao_derruba_as_boas() -> None:
    invalida = {**LICENCA_VALIDA, "fonte_urls": []}  # min_length=1 violado
    resultado, _ = _extrair({"licencas": [invalida, LICENCA_VALIDA]})

    assert len(resultado["licencas_brutas"]) == 1
    assert resultado["licencas_brutas"][0]["municipio_raw"] == "Caturama"
    assert len(resultado["validation_errors"]) == 1
    assert "licenca_bruta[0]" in resultado["validation_errors"][0]
    assert "fonte_urls" in resultado["validation_errors"][0]


def test_lote_vazio_nao_e_erro() -> None:
    resultado, _ = _extrair({"licencas": []})

    assert resultado == {"licencas_brutas": [], "validation_errors": []}


def test_prompt_path_existe_e_e_lido_como_system() -> None:
    assert PROMPT_PATH.exists()
    conteudo = PROMPT_PATH.read_text(encoding="utf-8")

    _, estruturador = _extrair({"licencas": []})

    assert len(estruturador.chamadas) == 1
    chamada = estruturador.chamadas[0]
    assert chamada["system"] == conteudo
    assert chamada["user"] == "relatório de teste"
    assert chamada["tag"] == "extract"
