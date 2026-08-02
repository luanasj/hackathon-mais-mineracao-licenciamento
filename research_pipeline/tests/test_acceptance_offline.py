"""Critérios de aceite AC1–AC7, offline e a custo zero (patch 11).

Duas famílias de teste, decisão D:

1. **Roteamento do grafo** (`apos_validate`, `apos_repair`, `repair`) é lógica pura — hand-built
   `state`, sem grafo montado, sem LLM. Mesma classe de teste que `test_validate.py` já usa para
   `validate_licencas`.
2. **O grafo de ponta a ponta**, com `FixtureStructurer` contra a fixture semente do patch 8 — o
   único jeito de medir AC1–AC7 é rodando o pipeline inteiro, não uma unidade isolada; ainda assim
   custo zero, porque `RP_LLM=fixture` nunca sai daqui. `check_golden.py` mede `extract`/`normalize`
   isolados; este arquivo mede o que só existe depois que o grafo (patch 11) liga os nós.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from langgraph.checkpoint.sqlite import SqliteSaver

from research_pipeline.aliases import load_overrides
from research_pipeline.graph import (
    REPAIR_ATTEMPTS_MAXIMO,
    apos_repair,
    apos_validate,
    build_graph,
    repair,
)
from research_pipeline.llm import get_structurer
from research_pipeline.matcher import build_ref_index, load_matching_config
from research_pipeline.refs import ReferenceData, load_reference_data
from research_pipeline.schemas import Produto

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

# ---------------------------------------------------------------------- roteamento (puro)


def test_apos_validate_vai_para_repair_com_erro_e_tentativa_disponivel() -> None:
    estado = {"validation_errors": ["algo quebrou"], "repair_attempts": 0}
    assert apos_validate(estado) == "repair"


def test_apos_validate_vai_direto_para_emit_sem_erro() -> None:
    estado = {"validation_errors": [], "repair_attempts": 0}
    assert apos_validate(estado) == "rank_and_emit"


def test_apos_validate_para_de_tentar_reparo_no_limite() -> None:
    """§5: no máximo `REPAIR_ATTEMPTS_MAXIMO` tentativas — no limite, segue para `rank_and_emit`
    mesmo com erro ainda presente, em vez de ciclar para sempre."""
    estado = {"validation_errors": ["ainda quebrado"], "repair_attempts": REPAIR_ATTEMPTS_MAXIMO}
    assert apos_validate(estado) == "rank_and_emit"


def test_repair_incrementa_tentativas() -> None:
    assert repair({"repair_attempts": 0}, {})["repair_attempts"] == 1
    assert repair({"repair_attempts": 1}, {})["repair_attempts"] == 2
    assert repair({}, {})["repair_attempts"] == 1


def test_apos_repair_volta_para_normalize_com_brutas_presentes() -> None:
    assert apos_repair({"licencas_brutas": [{"id": "x"}]}) == "normalize"


def test_apos_repair_volta_para_extract_com_brutas_vazias() -> None:
    """Único caso degenerado que reexecuta `extract` — nada sobreviveu ao Pydantic da rodada
    anterior, então não há o que `normalize` normalize."""
    assert apos_repair({"licencas_brutas": []}) == "extract"
    assert apos_repair({}) == "extract"


# ---------------------------------------------------------------------- grafo de ponta a ponta


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


@pytest.fixture(scope="module")
def configurable_base(refs: ReferenceData) -> dict[str, Any]:
    overrides = load_overrides()
    matching_config = load_matching_config()
    ref_index = build_ref_index(refs, overrides, matching_config)
    return {
        "refs": refs,
        "ref_index": ref_index,
        "matching_config": matching_config,
        "structurer": get_structurer("fixture"),
        "modelo_pesquisa": "relatorio_salvo",
        "modelo_estruturacao": "fixture",
    }


@pytest.fixture(scope="module")
def raw_report_semente() -> str:
    return (FIXTURES_DIR / "raw_report_2025_seed.md").read_text(encoding="utf-8")


def _rodar_pipeline(
    tmp_path: Path, run_id: str, configurable_base: dict[str, Any], raw_report: str
) -> tuple[dict[str, Any], Path]:
    run_dir = tmp_path / run_id
    run_dir.mkdir()
    with SqliteSaver.from_conn_string(str(tmp_path / "checkpoints.db")) as checkpointer:
        grafo = build_graph(checkpointer)
        config = {
            "configurable": {
                **configurable_base,
                "thread_id": run_id,
                "run_dir": run_dir,
            }
        }
        estado = {
            "ano": 2025,
            "run_id": run_id,
            "prompt_version": "deep_research_v1",
            "raw_report": raw_report,
        }
        resultado = grafo.invoke(estado, config=config)
    return resultado, run_dir


def _caminhos_de_chaves(obj: Any, prefixo: str = "") -> set[str]:
    """AC5: "mesmo formato e mesmas chaves entre execuções" — conjunto recursivo de caminhos de
    chave, ignorando valores (que mudam: `run_id`, `gerado_em`, contagens)."""
    caminhos: set[str] = set()
    if isinstance(obj, dict):
        for chave, valor in obj.items():
            caminho = f"{prefixo}.{chave}" if prefixo else chave
            caminhos.add(caminho)
            caminhos |= _caminhos_de_chaves(valor, caminho)
    elif isinstance(obj, list):
        for item in obj:
            caminhos |= _caminhos_de_chaves(item, prefixo)
    return caminhos


@pytest.fixture(scope="module")
def produto_de_um_run(
    tmp_path_factory: pytest.TempPathFactory,
    configurable_base: dict[str, Any],
    raw_report_semente: str,
) -> dict[str, Any]:
    tmp_path = tmp_path_factory.mktemp("run_unico")
    resultado, run_dir = _rodar_pipeline(tmp_path, "2025_20260801T143200Z", configurable_base, raw_report_semente)
    assert not resultado.get("validation_errors")
    return json.loads((run_dir / "licencas_2025.json").read_text(encoding="utf-8"))


def test_ac1_produto_valida_contra_o_schema_do_8(produto_de_um_run: dict[str, Any]) -> None:
    Produto.model_validate(produto_de_um_run)


def test_ac2_toda_licenca_tem_fonte_e_data_consulta(produto_de_um_run: dict[str, Any]) -> None:
    for licenca in produto_de_um_run["licencas"]:
        assert licenca["fonte_urls"], licenca["id"]
        assert licenca["data_consulta"], licenca["id"]


def test_ac3_municipio_e_consorcio_id_pertencem_as_tabelas(
    produto_de_um_run: dict[str, Any], refs: ReferenceData
) -> None:
    for licenca in produto_de_um_run["licencas"]:
        if licenca["municipio_id"] is not None:
            assert licenca["municipio_id"] in refs.municipios, licenca["id"]
        if licenca["consorcio_id"] is not None:
            assert licenca["consorcio_id"] in refs.consorcios, licenca["id"]


def test_ac4_tipologia_codigo_pertence_ao_vocabulario_fechado(
    produto_de_um_run: dict[str, Any], refs: ReferenceData
) -> None:
    for licenca in produto_de_um_run["licencas"]:
        if licenca["tipologia_codigo"] is not None:
            assert licenca["tipologia_codigo"] in refs.tipologias, licenca["id"]


def test_ac5_dois_runs_tem_chaves_identicas(
    tmp_path_factory: pytest.TempPathFactory, configurable_base: dict[str, Any], raw_report_semente: str
) -> None:
    tmp1 = tmp_path_factory.mktemp("ac5_a")
    tmp2 = tmp_path_factory.mktemp("ac5_b")
    r1, dir1 = _rodar_pipeline(tmp1, "2025_20260801T000000Z", configurable_base, raw_report_semente)
    r2, dir2 = _rodar_pipeline(tmp2, "2025_20260802T000000Z", configurable_base, raw_report_semente)

    p1 = json.loads((dir1 / "licencas_2025.json").read_text(encoding="utf-8"))
    p2 = json.loads((dir2 / "licencas_2025.json").read_text(encoding="utf-8"))
    assert _caminhos_de_chaves(p1) == _caminhos_de_chaves(p2)


def test_ac6_mesmo_run_id_produz_manifesto_byte_identico(
    tmp_path_factory: pytest.TempPathFactory, configurable_base: dict[str, Any], raw_report_semente: str
) -> None:
    """`gerado_em` vem do `run_id`, nunca do relógio (patch 10) — dois runs independentes com o
    mesmo `run_id` e a mesma entrada produzem `manifest.json` byte a byte idêntico."""
    run_id = "2025_20260801T143200Z"
    tmp1 = tmp_path_factory.mktemp("ac6_a")
    tmp2 = tmp_path_factory.mktemp("ac6_b")
    _, dir1 = _rodar_pipeline(tmp1, run_id, configurable_base, raw_report_semente)
    _, dir2 = _rodar_pipeline(tmp2, run_id, configurable_base, raw_report_semente)

    assert (dir1 / "manifest.json").read_bytes() == (dir2 / "manifest.json").read_bytes()
    assert (dir1 / "licencas_2025.json").read_bytes() == (dir2 / "licencas_2025.json").read_bytes()


def test_ac7_resume_nao_reinvoca_pesquisa(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, configurable_base: dict[str, Any], raw_report_semente: str
) -> None:
    """Metade offline do AC7: retomar uma *thread* já concluída não reexecuta nenhum nó — a prova
    mais simples de que o checkpoint, não uma nova chamada, é a fonte da retomada. `graph.py`
    importa `research` por nome no módulo; contar chamadas exige substituir esse nome **antes** de
    `build_graph` montar o grafo."""
    import research_pipeline.graph as grafo_modulo
    import research_pipeline.nodes.research as pesquisa_modulo

    chamadas = {"n": 0}
    original = pesquisa_modulo.research

    def contador(state: Any, config: Any) -> Any:
        chamadas["n"] += 1
        return original(state, config)

    monkeypatch.setattr(grafo_modulo, "research", contador)

    run_id = "2025_20260801T143200Z"
    run_dir = tmp_path / run_id
    run_dir.mkdir()
    with SqliteSaver.from_conn_string(str(tmp_path / "checkpoints.db")) as checkpointer:
        grafo = grafo_modulo.build_graph(checkpointer)
        config = {
            "configurable": {
                **configurable_base,
                "thread_id": run_id,
                "run_dir": run_dir,
            }
        }
        estado = {
            "ano": 2025,
            "run_id": run_id,
            "prompt_version": "deep_research_v1",
            "raw_report": raw_report_semente,
        }
        primeiro = grafo.invoke(estado, config=config)
        assert chamadas["n"] == 1

        segundo = grafo.invoke(None, config=config)
        assert chamadas["n"] == 1
        assert segundo == primeiro
