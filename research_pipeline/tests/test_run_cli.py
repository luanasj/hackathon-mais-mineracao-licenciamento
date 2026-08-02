"""Guardas de `run.py` que decidem **antes de gastar** (patch 14).

`load_dotenv` é neutralizado em todos os testes daqui. Não é detalhe de isolamento: `run.py` chama
`load_dotenv()` na primeira linha de `main()`, então um `.env` real do repositório com
`GEMINI_API_KEY` preenchida faz a guarda de chave passar — e o run segue para criar uma tarefa
Deep Research de verdade, de US$ 1–3. Um teste que só limpasse `os.environ` mediria o contrário do
que pretende e cobraria a diferença. `monkeypatch.setattr` no símbolo importado é o que garante
que nenhum arquivo do disco entre na decisão.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import research_pipeline.run as modulo_run


@pytest.fixture(autouse=True)
def sem_dotenv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(modulo_run, "load_dotenv", lambda *args, **kwargs: None)


def test_gemini_sem_chave_falha_antes_de_criar_run_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """AC8 aplicado à perna paga: sem `GEMINI_API_KEY` o processo sai `2` sem ter criado `run_dir`
    nem gravado `prompt.md` — e, sobretudo, sem ter chamado `interactions.create`."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("RP_LLM", "fixture")

    codigo = modulo_run.main(["--ano", "2025", "--research", "gemini", "--runs-dir", str(tmp_path)])

    assert codigo == 2
    assert "GEMINI_API_KEY" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == []


def test_resume_e_report_continuam_mutuamente_exclusivos(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("RP_LLM", "fixture")
    monkeypatch.setenv("RP_RESEARCH", "none")
    relatorio = tmp_path / "r.md"
    relatorio.write_text("# x", encoding="utf-8")

    codigo = modulo_run.main(
        ["--resume", "2025_20260801T143200Z", "--report", str(relatorio), "--runs-dir", str(tmp_path)]
    )

    assert codigo == 2
    assert "mutuamente exclusivos" in capsys.readouterr().err


def test_ano_obrigatorio_fora_de_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("RP_LLM", "fixture")
    monkeypatch.setenv("RP_RESEARCH", "none")

    codigo = modulo_run.main(["--runs-dir", str(tmp_path)])

    assert codigo == 2
    assert "--ano" in capsys.readouterr().err
