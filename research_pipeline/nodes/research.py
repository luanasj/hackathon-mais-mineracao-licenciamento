"""Nó `research` — fonte do relatório bruto (§4, §9 do GOAL.md).

Nesta versão o nó **só** consome relatório já salvo: o cliente Gemini Deep Research real chega no
patch 14. Dois caminhos, na ordem que o §9 promete ("relatório salvo pula o nó `deep_research`"):

1. `state["raw_report"]` já setado — `run.py` põe isso quando o usuário passa `--report PATH`
   (decisão do §9), e o nó não faz nada além de deixar passar.
2. `config["configurable"]["run_dir"] / "raw_report.md"` existe — o relatório de um run anterior
   (retomada via `--resume`, ou um `--report` de uma invocação passada que já gravou o arquivo).

Sem nenhum dos dois, `ResearchNotConfigured` — não há Deep Research real ainda para acionar.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

__all__ = ["ResearchNotConfigured", "research"]


class ResearchNotConfigured(Exception):
    """Nenhum relatório disponível e nenhum cliente de pesquisa real existe ainda (patch 14)."""


def research(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"raw_report": str}` (ou `{}` quando o relatório já veio no estado)."""
    if state.get("raw_report"):
        return {}
    run_dir = Path(config["configurable"]["run_dir"])
    salvo = run_dir / "raw_report.md"
    if salvo.exists():
        return {"raw_report": salvo.read_text(encoding="utf-8")}
    raise ResearchNotConfigured("nenhum relatório salvo; --research gemini chega no patch 14")
