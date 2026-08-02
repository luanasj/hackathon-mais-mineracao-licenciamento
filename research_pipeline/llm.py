"""Interface do estruturador LLM — `Protocol` + implementações fixture e real (patches 8 e 13).

Chave de fixture é **`tag`, não hash do prompt.** Hash do texto do prompt invalidaria toda
fixture salva a cada edição de wording — a fixture é sobre o *par* entrada/saída de um nó, não
sobre bytes exatos do prompt. `_meta.prompt_sha`, se presente no arquivo, ainda é conferido: a
deriva vira `logger.warning`, nunca falha. Travar nisso tornaria toda evolução de prompt uma
quebra de fixture, o oposto do que a decisão 8 (determinismo por prompt versionado) pede — versão
de prompt já é rastreada por `prompt_version` no manifesto, não precisa duplicar como trava aqui.

`RP_FIXTURE_RECORD=1` (patch 13) envolve o estruturador real num `RecordingStructurer`: cada
resposta que a DeepSeek devolve é gravada em `tests/fixtures/llm_responses/` no mesmo formato que
`FixtureStructurer` lê, com `_meta.prompt_sha` calculado do mesmo jeito. Isso mantém as fixtures
honestas — geradas por uma chamada real, uma vez, em vez de escritas à mão para sempre — sem
nenhuma lógica nova em `FixtureStructurer`, que já sabia ler `_meta.prompt_sha`.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Protocol

__all__ = [
    "FixtureMissing",
    "FixtureStructurer",
    "RecordingStructurer",
    "Structurer",
    "get_structurer",
]

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


class RecordingStructurer:
    """Envolve outro `Structurer` e grava toda resposta real em `tests/fixtures/llm_responses/`,
    no mesmo formato — `{tag}[__{case}].json` com `_meta.prompt_sha` — que `FixtureStructurer`
    lê. Repassa a resposta sem alterar; a gravação é efeito colateral, nunca muda o retorno."""

    def __init__(self, interno: Structurer, fixtures_dir: Path = FIXTURES_DIR) -> None:
        self._interno = interno
        self._dir = fixtures_dir

    def complete_json(
        self, *, system: str, user: str, tag: str, case: str | None = None
    ) -> dict:
        resposta = self._interno.complete_json(system=system, user=user, tag=tag, case=case)

        nome = f"{tag}__{case}.json" if case else f"{tag}.json"
        prompt_sha = hashlib.sha256(f"{system}\n{user}".encode("utf-8")).hexdigest()
        corpo = {**resposta, "_meta": {"prompt_sha": prompt_sha}}
        self._dir.mkdir(parents=True, exist_ok=True)
        (self._dir / nome).write_text(
            json.dumps(corpo, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"
        )
        return resposta


def get_structurer(nome: str) -> Structurer:
    if nome == "fixture":
        return FixtureStructurer()
    if nome == "deepseek":
        from research_pipeline.llm_deepseek import DeepSeekStructurer

        estruturador: Structurer = DeepSeekStructurer()
        if os.environ.get("RP_FIXTURE_RECORD") == "1":
            estruturador = RecordingStructurer(estruturador)
        return estruturador
    raise ValueError(f"estruturador desconhecido: {nome!r}")
