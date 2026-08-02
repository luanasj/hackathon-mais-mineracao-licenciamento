"""`DeepSeekStructurer` — primeira chamada real de LLM do pipeline (patch 13, ~US$ 0,01).

Mesmo `Structurer` Protocol de `llm.py` (patch 8): `complete_json(*, system, user, tag, case)
-> dict`. `tag`/`case` não influenciam a chamada real — só existem no Protocol porque
`FixtureStructurer` precisa deles para escolher arquivo; aqui ficam sem uso, o mesmo padrão de
parâmetro ignorado que um Protocol compartilhado exige.

Retentativa é por **duck typing em `status_code`**, não por `except openai.RateLimitError`: a
biblioteca `openai` expõe `status_code` em toda `APIStatusError` (429 e 5xx inclusive), e checar
o atributo em vez do tipo exato deixa o teste injetar uma exceção falsa sem depender da árvore de
classes real da lib — o mesmo motivo por que `Structurer` é um Protocol e não uma classe base.
4xx fora de 429 nunca é retentável (chave errada, payload inválido) — insistir só queima chamada.

Custo/tokens ficam acumulados em `tokens_entrada`/`tokens_saida`/`custo_usd` na própria instância;
plugar isso em `manifest.json` exige `emit.py` carregar o valor via `state`, o que nenhum nó ainda
faz (`run.py` não passa a instância de `structurer` adiante do grafo) — fica para o patch que
ligar a chamada real ao grafo de ponta a ponta.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

__all__ = ["DeepSeekStructurer"]

_BASE_URL = "https://api.deepseek.com/v1"
_MODELO = "deepseek-v4-flash"

_PRECO_ENTRADA_USD_POR_1M = 0.14
"""Cache miss — preço confirmado na doc oficial (patch 13)."""
_PRECO_SAIDA_USD_POR_1M = 0.28

_MAX_TENTATIVAS_PADRAO = 5


def _e_retentavel(erro: Exception) -> bool:
    status = getattr(erro, "status_code", None)
    return status == 429 or (status is not None and status >= 500)


class DeepSeekStructurer:
    """`Structurer` real via `langchain-openai` apontando pro endpoint compatível da DeepSeek."""

    def __init__(
        self,
        *,
        cliente: Any = None,
        sleep: Any = None,
        max_tentativas: int = _MAX_TENTATIVAS_PADRAO,
    ) -> None:
        self._cliente = cliente or ChatOpenAI(
            base_url=_BASE_URL,
            model=_MODELO,
            temperature=0,
            api_key=os.environ.get("DEEPSEEK_API_KEY") or "sem-chave-configurada",
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        self._sleep = sleep or time.sleep
        self._max_tentativas = max_tentativas
        self.tokens_entrada = 0
        self.tokens_saida = 0

    @property
    def custo_usd(self) -> float:
        return (
            self.tokens_entrada / 1_000_000 * _PRECO_ENTRADA_USD_POR_1M
            + self.tokens_saida / 1_000_000 * _PRECO_SAIDA_USD_POR_1M
        )

    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict:
        mensagens = [SystemMessage(content=system), HumanMessage(content=user)]
        resposta = self._invocar_com_retry(mensagens)

        uso = getattr(resposta, "usage_metadata", None) or {}
        self.tokens_entrada += uso.get("input_tokens", 0)
        self.tokens_saida += uso.get("output_tokens", 0)

        return json.loads(resposta.content)

    def _invocar_com_retry(self, mensagens: list[Any]) -> Any:
        ultimo_erro: Exception | None = None
        for tentativa in range(self._max_tentativas):
            try:
                return self._cliente.invoke(mensagens)
            except Exception as erro:  # noqa: BLE001 — reclassificado por status_code, não por tipo
                if not _e_retentavel(erro):
                    raise
                ultimo_erro = erro
                if tentativa < self._max_tentativas - 1:
                    self._sleep(2**tentativa)
        assert ultimo_erro is not None
        raise ultimo_erro
