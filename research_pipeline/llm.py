"""Interface do estruturador LLM — `Protocol` + implementação fixture (patch 8).

Só `FixtureStructurer` existe até aqui; `get_structurer("deepseek")` levanta
`NotImplementedError` até o patch 13 trazer a chamada real via `langchain-openai` apontando
pro endpoint compatível da DeepSeek (§10 do GOAL.md).

Chave de fixture é **`tag`, não hash do prompt.** Hash do texto do prompt invalidaria toda
fixture salva a cada edição de wording — a fixture é sobre o *par* entrada/saída de um nó, não
sobre bytes exatos do prompt. `_meta.prompt_sha`, se presente no arquivo, ainda é conferido: a
deriva vira `logger.warning`, nunca falha. Travar nisso tornaria toda evolução de prompt uma
quebra de fixture, o oposto do que a decisão 8 (determinismo por prompt versionado) pede — versão
de prompt já é rastreada por `prompt_version` no manifesto, não precisa duplicar como trava aqui.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Protocol

__all__ = ["FixtureMissing", "FixtureStructurer", "Structurer", "get_structurer"]

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).resolve().parent / "tests" / "fixtures" / "llm_responses"


class FixtureMissing(Exception):
    """Fixture de resposta LLM não encontrada. Nomeia o caminho exato que faltou."""


class Structurer(Protocol):
    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict: ...


class FixtureStructurer:
    """Lê `tests/fixtures/llm_responses/{tag}[__{case}].json`. Zero rede, zero chave.

    `system`/`user` não escolhem a fixture — só alimentam a conferência de `prompt_sha`. Quem
    escolhe é `tag`/`case`, o mesmo par que `check_golden.py` usa para nomear um nó.
    """

    def __init__(self, fixtures_dir: Path = FIXTURES_DIR) -> None:
        self._dir = fixtures_dir

    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict:
        nome = f"{tag}__{case}.json" if case else f"{tag}.json"
        caminho = self._dir / nome
        if not caminho.exists():
            raise FixtureMissing(str(caminho))

        bruto = json.loads(caminho.read_text(encoding="utf-8"))
        meta = bruto.pop("_meta", None)
        if meta and "prompt_sha" in meta:
            atual = hashlib.sha256(f"{system}\n{user}".encode("utf-8")).hexdigest()
            if atual != meta["prompt_sha"]:
                logger.warning(
                    "fixture %s: prompt divergiu do sha gravado (%s != %s) — resposta pode "
                    "não corresponder ao prompt atual",
                    nome,
                    meta["prompt_sha"],
                    atual,
                )
        return bruto


def get_structurer(nome: str) -> Structurer:
    if nome == "fixture":
        return FixtureStructurer()
    if nome == "deepseek":
        raise NotImplementedError("chega no patch 13")
    raise ValueError(f"estruturador desconhecido: {nome!r}")
