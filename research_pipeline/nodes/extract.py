"""Nó `extract` — relatório markdown cru vira `list[LicencaBruta]` (§6.1 do GOAL.md).

Falha de Pydantic por linha nunca aborta o lote: acumula em `validation_errors`, no mesmo padrão
de acumulação do validador do patch 7 — descartar as linhas boas por causa de uma ruim é o
inverso do que o §6.2 pede, e o laço de reparo (patch 11) precisa da mensagem realimentada como
texto, não de uma exceção.

Este nó **não recebe** as listas canônicas — só o `matcher`/`normalize` (patch 9) veem os 417/29.
É a separação que o §3 chama de "principal defesa contra alucinação": `extract` não pode inventar
um município que existe no banco mas não no texto.

Assinatura `(state, config)` já no formato de nó LangGraph, mesmo sem `graph.py` existir ainda
(patch 11) — a assinatura não depende do grafo estar montado. `config["configurable"]["structurer"]`
segue o mesmo padrão de `config["configurable"]["refs"]` (decisão 18, §3): o estado do grafo não
carrega objetos pesados que o `SqliteSaver` teria de serializar a cada checkpoint.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import ValidationError

from research_pipeline.llm import Structurer
from research_pipeline.schemas import LicencaBruta

__all__ = ["PROMPT_PATH", "extract"]

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "extract_v1.md"


def _formatar_erro(indice: int, erro: ValidationError) -> list[str]:
    return [
        f"licenca_bruta[{indice}]: {'.'.join(str(parte) for parte in e['loc']) or '(raiz)'}: "
        f"{e['msg']}"
        for e in erro.errors()
    ]


def extract(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"licencas_brutas": [...], "validation_errors": [...]}`."""
    structurer: Structurer = config["configurable"]["structurer"]
    system = PROMPT_PATH.read_text(encoding="utf-8")
    raw_report = state["raw_report"]

    resposta = structurer.complete_json(system=system, user=raw_report, tag="extract")

    brutas: list[LicencaBruta] = []
    erros: list[str] = []
    for indice, linha in enumerate(resposta.get("licencas", [])):
        try:
            brutas.append(LicencaBruta.model_validate(linha))
        except ValidationError as erro:
            erros.extend(_formatar_erro(indice, erro))

    return {
        "licencas_brutas": [b.model_dump(mode="json") for b in brutas],
        "validation_errors": erros,
    }
