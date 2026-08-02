"""Testa `llm_deepseek.py` (patch 13) — retry/backoff e contabilidade de tokens/custo, com
cliente falso injetado via `cliente=`. Zero rede, zero chave: nenhum teste aqui constrói o
`ChatOpenAI` real."""

from __future__ import annotations

import json
from typing import Any

import pytest

from research_pipeline.llm_deepseek import DeepSeekStructurer


class _MensagemFalsa:
    def __init__(self, content: str, usage_metadata: dict | None = None) -> None:
        self.content = content
        self.usage_metadata = usage_metadata or {}


class _ErroAPIFalso(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"status {status_code}")
        self.status_code = status_code


class _ClienteFalso:
    """`invoke` devolve/levanta o próximo item de `roteiro`, na ordem."""

    def __init__(self, roteiro: list[Any]) -> None:
        self._roteiro = iter(roteiro)
        self.chamadas = 0

    def invoke(self, mensagens: list[Any]) -> Any:
        self.chamadas += 1
        item = next(self._roteiro)
        if isinstance(item, Exception):
            raise item
        return item


def _sleep_falso() -> tuple[Any, list[float]]:
    esperas: list[float] = []
    return esperas.append, esperas


def test_complete_json_parseia_resposta_e_acumula_tokens() -> None:
    cliente = _ClienteFalso([_MensagemFalsa('{"licencas": []}', {"input_tokens": 100, "output_tokens": 50})])
    estruturador = DeepSeekStructurer(cliente=cliente)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert resposta == {"licencas": []}
    assert estruturador.tokens_entrada == 100
    assert estruturador.tokens_saida == 50


def test_tokens_acumulam_entre_chamadas() -> None:
    cliente = _ClienteFalso(
        [
            _MensagemFalsa("{}", {"input_tokens": 10, "output_tokens": 5}),
            _MensagemFalsa("{}", {"input_tokens": 20, "output_tokens": 8}),
        ]
    )
    estruturador = DeepSeekStructurer(cliente=cliente)

    estruturador.complete_json(system="sys", user="user", tag="extract")
    estruturador.complete_json(system="sys", user="user", tag="extract")

    assert estruturador.tokens_entrada == 30
    assert estruturador.tokens_saida == 13


def test_custo_usd_usa_precos_documentados() -> None:
    """US$ 0,14/1M in · US$ 0,28/1M out (cache miss) — preço confirmado na doc oficial."""
    cliente = _ClienteFalso(
        [_MensagemFalsa("{}", {"input_tokens": 1_000_000, "output_tokens": 1_000_000})]
    )
    estruturador = DeepSeekStructurer(cliente=cliente)

    estruturador.complete_json(system="sys", user="user", tag="extract")

    assert estruturador.custo_usd == pytest.approx(0.14 + 0.28)


def test_resposta_sem_usage_metadata_nao_quebra() -> None:
    cliente = _ClienteFalso([_MensagemFalsa("{}")])
    estruturador = DeepSeekStructurer(cliente=cliente)

    estruturador.complete_json(system="sys", user="user", tag="extract")

    assert estruturador.tokens_entrada == 0
    assert estruturador.tokens_saida == 0


def test_retenta_em_429_e_sucede_na_segunda() -> None:
    cliente = _ClienteFalso([_ErroAPIFalso(429), _MensagemFalsa('{"ok": true}')])
    sleep, esperas = _sleep_falso()
    estruturador = DeepSeekStructurer(cliente=cliente, sleep=sleep)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert resposta == {"ok": True}
    assert cliente.chamadas == 2
    assert esperas == [1]


def test_retenta_em_500_e_sucede_na_segunda() -> None:
    cliente = _ClienteFalso([_ErroAPIFalso(503), _MensagemFalsa('{"ok": true}')])
    sleep, _ = _sleep_falso()
    estruturador = DeepSeekStructurer(cliente=cliente, sleep=sleep)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert resposta == {"ok": True}


def test_nao_retenta_em_400() -> None:
    cliente = _ClienteFalso([_ErroAPIFalso(400)])
    sleep, esperas = _sleep_falso()
    estruturador = DeepSeekStructurer(cliente=cliente, sleep=sleep)

    with pytest.raises(_ErroAPIFalso):
        estruturador.complete_json(system="sys", user="user", tag="extract")

    assert cliente.chamadas == 1
    assert esperas == []


def test_esgota_tentativas_e_relevanta_ultimo_erro() -> None:
    cliente = _ClienteFalso([_ErroAPIFalso(429), _ErroAPIFalso(429), _ErroAPIFalso(429)])
    sleep, esperas = _sleep_falso()
    estruturador = DeepSeekStructurer(cliente=cliente, sleep=sleep, max_tentativas=3)

    with pytest.raises(_ErroAPIFalso):
        estruturador.complete_json(system="sys", user="user", tag="extract")

    assert cliente.chamadas == 3
    assert esperas == [1, 2]


def test_backoff_exponencial_entre_tentativas() -> None:
    cliente = _ClienteFalso(
        [_ErroAPIFalso(500), _ErroAPIFalso(500), _ErroAPIFalso(500), _MensagemFalsa("{}")]
    )
    sleep, esperas = _sleep_falso()
    estruturador = DeepSeekStructurer(cliente=cliente, sleep=sleep, max_tentativas=5)

    estruturador.complete_json(system="sys", user="user", tag="extract")

    assert esperas == [1, 2, 4]


def test_construir_sem_chave_no_ambiente_nao_quebra(monkeypatch: pytest.MonkeyPatch) -> None:
    """Instanciar sem `DEEPSEEK_API_KEY` não pode exigir rede nem chave — só a chamada real
    falharia, e nenhum teste aqui faz uma."""
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    DeepSeekStructurer()
