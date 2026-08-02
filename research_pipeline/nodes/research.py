"""Nós `research_start` e `research` — a perna paga do pipeline (§4, §9 do GOAL.md).

**Por que são dois nós e não um.** O AC7 exige que o `interaction_id` esteja no checkpoint *antes*
do primeiro poll: um processo morto durante o polling tem de retomar a mesma tarefa, nunca criar
outra de US$ 1–3. O LangGraph grava o checkpoint quando um nó **retorna** — dentro de um único nó
que criasse a tarefa e ficasse pollando por até uma hora, o `interaction_id` só chegaria ao disco
depois do polling terminar, isto é, exatamente no caso em que ele não é mais necessário. Partir em
dois é o que torna a ordem prometida no §4 mecanicamente verdadeira, não uma intenção.

`research_start` decide se cria a tarefa; `research` resolve o relatório. As quatro situações, na
ordem em que os dois nós as testam:

1. `state["raw_report"]` já setado — `--report PATH` (§9). Nenhum dos dois nós faz nada.
2. `run_dir/raw_report.md` existe — run anterior (`--resume`, ou um `--report` já gravado).
3. `state["interaction_id"]` setado — tarefa já criada: `research_start` não recria, `research`
   só retoma o polling.
4. Nada disso e há `research_client` — `research_start` chama `start()` e devolve o
   `interaction_id`; o checkpoint fecha; só então `research` entra e polla.

Sem relatório e sem cliente, `ResearchNotConfigured`.

O `poll_timeout` estourar **não é perda**: o `interaction_id` já está no checkpoint, então
`--resume <run_id>` recomeça o polling da mesma tarefa. Por isso `ResearchTimeout` é uma exceção
própria e não um `ResearchFailed` — a primeira é retomável, a segunda não.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from research_pipeline.research import ResearchClient, ResearchResult

__all__ = [
    "POLL_INTERVALO_PADRAO",
    "POLL_TIMEOUT_PADRAO",
    "ResearchNotConfigured",
    "ResearchTimeout",
    "research",
    "research_start",
]

POLL_TIMEOUT_PADRAO = 3600
"""Segundos. Uma tarefa de Deep Research leva minutos a dezenas de minutos (§4)."""
POLL_INTERVALO_PADRAO = 30


class ResearchNotConfigured(Exception):
    """Nenhum relatório salvo e nenhum cliente de pesquisa configurado."""


class ResearchTimeout(Exception):
    """`poll_timeout` estourou com a tarefa ainda em andamento. Retomável por `--resume`."""


def _relatorio_salvo(config: dict[str, Any]) -> Path:
    return Path(config["configurable"]["run_dir"]) / "raw_report.md"


def _ja_tem_relatorio(state: dict[str, Any], config: dict[str, Any]) -> bool:
    return bool(state.get("raw_report")) or _relatorio_salvo(config).exists()


def research_start(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"interaction_id": str}` (ou `{}` quando não há tarefa a criar)."""
    if _ja_tem_relatorio(state, config) or state.get("interaction_id"):
        return {}

    cliente: ResearchClient | None = config["configurable"].get("research_client")
    if cliente is None:
        return {}

    prompt = config["configurable"]["research_prompt"]
    return {"interaction_id": cliente.start(prompt)}


def _aguardar(cliente: ResearchClient, interaction_id: str, config: dict[str, Any]) -> ResearchResult:
    configuravel = config["configurable"]
    timeout = configuravel.get("poll_timeout", POLL_TIMEOUT_PADRAO)
    intervalo = configuravel.get("poll_intervalo", POLL_INTERVALO_PADRAO)
    dormir = configuravel.get("poll_sleep", time.sleep)
    relogio = configuravel.get("poll_relogio", time.monotonic)

    limite = relogio() + timeout
    while True:
        resultado = cliente.poll(interaction_id)
        if resultado is not None:
            return resultado
        if relogio() >= limite:
            raise ResearchTimeout(
                f"{interaction_id}: ainda em andamento após {timeout}s — "
                f"retome com --resume {config['configurable'].get('run_id', '<run_id>')}"
            )
        dormir(intervalo)


def research(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"raw_report": str, "citations": [...]}` (ou `{}` quando o relatório já
    veio no estado)."""
    if state.get("raw_report"):
        return {}

    salvo = _relatorio_salvo(config)
    if salvo.exists():
        return {"raw_report": salvo.read_text(encoding="utf-8")}

    interaction_id = state.get("interaction_id")
    if not interaction_id:
        raise ResearchNotConfigured(
            "nenhum relatório salvo e nenhum cliente de pesquisa: use --report PATH ou "
            "--research gemini"
        )

    cliente: ResearchClient = config["configurable"]["research_client"]
    resultado = _aguardar(cliente, interaction_id, config)

    run_dir = Path(config["configurable"]["run_dir"])
    salvo.write_text(resultado.raw_report, encoding="utf-8")
    (run_dir / "citations.json").write_text(
        json.dumps(resultado.citations, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"raw_report": resultado.raw_report, "citations": resultado.citations}
