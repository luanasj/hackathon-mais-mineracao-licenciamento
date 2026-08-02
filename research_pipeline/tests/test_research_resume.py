"""AC7 offline — a metade que custa US$ 1–3 se estiver errada (patch 14).

`FakeResearchClient` conta `start()`. A afirmação central deste arquivo é uma só, repetida por
ângulos diferentes: **nenhuma sequência de morte-e-retomada chama `start()` duas vezes.** Zero
rede, zero chave — o cliente real (`GeminiDeepResearch`) nunca é instanciado aqui.

O grafo é montado de verdade (`build_graph` + `SqliteSaver` em `tmp_path`), porque a garantia que
se quer medir é sobre *checkpoint*, não sobre a função: um teste que chamasse os nós direto
provaria só que eles leem `state["interaction_id"]`, não que o `interaction_id` chegou ao disco
antes do primeiro poll.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from langgraph.checkpoint.sqlite import SqliteSaver

from research_pipeline.nodes.research import (
    ResearchNotConfigured,
    ResearchTimeout,
    research,
    research_start,
)
from research_pipeline.research import FakeResearchClient, ResearchResult

RELATORIO = "# relatório vindo do Deep Research"
CITACOES = [{"url": "https://exemplo.invalid/a", "titulo": "A", "trecho": "t", "indice": 0}]


def _resultado() -> ResearchResult:
    return ResearchResult(raw_report=RELATORIO, citations=list(CITACOES))


def _config(run_dir: Path, cliente: Any, **extra: Any) -> dict[str, Any]:
    configuravel: dict[str, Any] = {
        "run_dir": run_dir,
        "run_id": "2025_20260801T143200Z",
        "research_client": cliente,
        "research_prompt": "pesquise licenças de 2025",
        "poll_intervalo": 0,
        "poll_sleep": lambda _segundos: None,
    }
    configuravel.update(extra)
    return {"configurable": configuravel}


# ------------------------------------------------------------------ research_start


def test_start_cria_tarefa_e_devolve_interaction_id(tmp_path: Path) -> None:
    cliente = FakeResearchClient(_resultado())

    resultado = research_start({}, _config(tmp_path, cliente))

    assert resultado == {"interaction_id": "fake-interaction-1"}
    assert cliente.starts == 1
    assert cliente.prompts == ["pesquise licenças de 2025"]


def test_start_nao_recria_tarefa_ja_existente(tmp_path: Path) -> None:
    """O caminho da retomada: `interaction_id` veio do checkpoint, `start()` não é chamado."""
    cliente = FakeResearchClient(_resultado())

    resultado = research_start({"interaction_id": "ja-existe"}, _config(tmp_path, cliente))

    assert resultado == {}
    assert cliente.starts == 0


def test_start_nao_pesquisa_com_relatorio_no_estado(tmp_path: Path) -> None:
    cliente = FakeResearchClient(_resultado())

    assert research_start({"raw_report": "# salvo"}, _config(tmp_path, cliente)) == {}
    assert cliente.starts == 0


def test_start_nao_pesquisa_com_relatorio_em_disco(tmp_path: Path) -> None:
    (tmp_path / "raw_report.md").write_text("# do disco", encoding="utf-8")
    cliente = FakeResearchClient(_resultado())

    assert research_start({}, _config(tmp_path, cliente)) == {}
    assert cliente.starts == 0


def test_start_sem_cliente_nao_levanta(tmp_path: Path) -> None:
    """`--research none` é o caminho normal offline: quem transforma a falta de relatório em erro
    é `research`, não `research_start` — assim a mensagem sai uma vez só, no lugar certo."""
    assert research_start({}, _config(tmp_path, None)) == {}


# ------------------------------------------------------------------ research (polling)


def test_research_polla_ate_concluir_e_grava_artefatos(tmp_path: Path) -> None:
    cliente = FakeResearchClient(_resultado(), polls_ate_concluir=3)

    resultado = research({"interaction_id": "abc"}, _config(tmp_path, cliente))

    assert resultado["raw_report"] == RELATORIO
    assert resultado["citations"] == CITACOES
    assert cliente.polls == 3
    assert cliente.ids_pollados == ["abc", "abc", "abc"]
    assert (tmp_path / "raw_report.md").read_text(encoding="utf-8") == RELATORIO
    assert json.loads((tmp_path / "citations.json").read_text(encoding="utf-8")) == CITACOES


def test_research_sem_interaction_id_e_sem_relatorio_levanta(tmp_path: Path) -> None:
    with pytest.raises(ResearchNotConfigured):
        research({}, _config(tmp_path, FakeResearchClient(_resultado())))


def test_timeout_levanta_research_timeout_e_nomeia_o_resume(tmp_path: Path) -> None:
    """Nunca conclui: `polls_ate_concluir` alto e relógio que salta além do limite no 1º poll."""
    cliente = FakeResearchClient(_resultado(), polls_ate_concluir=10_000)
    tempos = iter([0, 999_999, 999_999])

    with pytest.raises(ResearchTimeout, match="--resume 2025_20260801T143200Z"):
        research(
            {"interaction_id": "abc"},
            _config(tmp_path, cliente, poll_timeout=60, poll_relogio=lambda: next(tempos)),
        )

    assert cliente.polls == 1


def test_timeout_zero_ainda_polla_uma_vez(tmp_path: Path) -> None:
    """A checagem de prazo vem **depois** do poll — um `poll_timeout` apertado não pode fazer o
    nó desistir sem sequer perguntar se a tarefa já terminou."""
    cliente = FakeResearchClient(_resultado())

    resultado = research({"interaction_id": "abc"}, _config(tmp_path, cliente, poll_timeout=0))

    assert resultado["raw_report"] == RELATORIO
    assert cliente.polls == 1


def test_relatorio_em_disco_vence_o_polling(tmp_path: Path) -> None:
    (tmp_path / "raw_report.md").write_text("# do disco", encoding="utf-8")
    cliente = FakeResearchClient(_resultado())

    resultado = research({"interaction_id": "abc"}, _config(tmp_path, cliente))

    assert resultado == {"raw_report": "# do disco"}
    assert cliente.polls == 0


# ------------------------------------------------------------------ AC7 no grafo montado


class _ClienteQueMorreNoPolling(FakeResearchClient):
    """Levanta na primeira leva de polls, como um processo morto no meio da espera; depois de
    `curar()`, devolve o resultado. `start()` continua contado pela classe base."""

    def __init__(self, resultado: ResearchResult) -> None:
        super().__init__(resultado)
        self._quebrado = True

    def curar(self) -> None:
        self._quebrado = False

    def poll(self, interaction_id: str) -> ResearchResult | None:
        if self._quebrado:
            self.polls += 1
            raise RuntimeError("processo morreu durante o polling")
        return super().poll(interaction_id)


def _configurable_do_grafo(run_dir: Path, cliente: Any, refs_base: dict[str, Any]) -> dict[str, Any]:
    return {
        **refs_base,
        "thread_id": "2025_20260801T143200Z",
        "run_id": "2025_20260801T143200Z",
        "run_dir": run_dir,
        "research_client": cliente,
        "research_prompt": "pesquise licenças de 2025",
        "poll_intervalo": 0,
        "poll_sleep": lambda _segundos: None,
    }


def test_ac7_morrer_no_polling_e_retomar_nao_chama_start_duas_vezes(tmp_path: Path) -> None:
    """O teste que justifica os dois nós: o `interaction_id` tem de estar no checkpoint gravado
    **antes** do poll que morreu — senão a retomada não tem o que retomar e cria outra tarefa de
    US$ 1–3. Roda só `research_start -> research`; o resto do grafo não participa da garantia e
    exigiria as tabelas canônicas, que este arquivo não carrega.
    """
    from langgraph.graph import END, START, StateGraph

    from research_pipeline.graph import PipelineState

    def sem_anotacao(no: Any) -> Any:
        return lambda state, config: no(state, config)

    cliente = _ClienteQueMorreNoPolling(_resultado())
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    with SqliteSaver.from_conn_string(str(tmp_path / "checkpoints.db")) as checkpointer:
        construtor = StateGraph(PipelineState)
        construtor.add_node("research_start", sem_anotacao(research_start))
        construtor.add_node("research", sem_anotacao(research))
        construtor.add_edge(START, "research_start")
        construtor.add_edge("research_start", "research")
        construtor.add_edge("research", END)
        grafo = construtor.compile(checkpointer=checkpointer)

        config = {"configurable": _configurable_do_grafo(run_dir, cliente, {})}
        estado = {"ano": 2025, "run_id": "2025_20260801T143200Z", "prompt_version": "deep_research_v1"}

        with pytest.raises(RuntimeError, match="morreu durante o polling"):
            grafo.invoke(estado, config=config)

        assert cliente.starts == 1
        assert grafo.get_state(config).values["interaction_id"] == "fake-interaction-1"

        cliente.curar()
        resultado = grafo.invoke(None, config=config)

    assert cliente.starts == 1, "retomada criou uma segunda tarefa paga"
    assert resultado["raw_report"] == RELATORIO
    assert resultado["citations"] == CITACOES
