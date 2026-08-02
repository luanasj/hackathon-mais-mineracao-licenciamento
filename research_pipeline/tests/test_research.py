"""Nó `research` (patch 11) — puro, `tmp_path` como único I/O. Sem LLM: este nó não chama nenhum,
nem nesta versão nem em nenhuma outra até o patch 14 trazer o cliente Gemini real.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from research_pipeline.nodes.research import ResearchNotConfigured, research


def _config(run_dir: Path) -> dict[str, Any]:
    return {"configurable": {"run_dir": run_dir}}


def test_relatorio_ja_no_estado_passa_direto_sem_tocar_disco(tmp_path: Path) -> None:
    estado = {"raw_report": "# relatório"}
    resultado = research(estado, _config(tmp_path))
    assert resultado == {}


def test_le_relatorio_salvo_no_run_dir(tmp_path: Path) -> None:
    (tmp_path / "raw_report.md").write_text("# relatório salvo", encoding="utf-8")
    resultado = research({}, _config(tmp_path))
    assert resultado == {"raw_report": "# relatório salvo"}


def test_levanta_sem_relatorio_em_nenhum_dos_dois_lugares(tmp_path: Path) -> None:
    with pytest.raises(ResearchNotConfigured, match="patch 14"):
        research({}, _config(tmp_path))


def test_raw_report_vazio_no_estado_ainda_le_do_disco(tmp_path: Path) -> None:
    """`state.get("raw_report")` falso (`None` ou `""`) não conta como "já setado" — cai para o
    caminho do arquivo, o mesmo que uma retomada sem `--report` novo exercitaria."""
    (tmp_path / "raw_report.md").write_text("# do disco", encoding="utf-8")
    resultado = research({"raw_report": None}, _config(tmp_path))
    assert resultado == {"raw_report": "# do disco"}
