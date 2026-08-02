"""CLI — `python -m research_pipeline.run` (§9 do GOAL.md).

`load_reference_data()` roda **primeiro, sempre**, antes de montar `structurer`/`checkpointer` e
antes de qualquer nó do grafo executar — é isso, e não uma checagem redundante, que garante o AC8
("falhar antes de gastar"): um `data/processed/*.json` corrompido derruba o processo na primeira
linha de `main()`, nunca no meio de um run que já chamou LLM.

`--report PATH` e `--resume RUN_ID` são as duas formas distintas de não repagar a pesquisa (§9) —
mutuamente exclusivas aqui: `--resume` continua uma *thread* já existente pelo checkpoint (o nó
`research` de um run anterior já gravou `raw_report.md` em `run_dir`, ou o estado do checkpoint já
carrega `raw_report`), então injetar um relatório novo por cima seria ambíguo sobre qual dos dois
prevalece. `--ano` é dispensado só quando `--resume` está presente — o ano mora no prefixo do
próprio `run_id` (`f"{ano}_{timestamp}"`).
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langgraph.checkpoint.sqlite import SqliteSaver

from research_pipeline.aliases import load_overrides
from research_pipeline.graph import build_graph
from research_pipeline.llm import get_structurer
from research_pipeline.matcher import build_ref_index, load_matching_config
from research_pipeline.nodes.research import ResearchNotConfigured
from research_pipeline.refs import ReferenceData, load_reference_data

__all__ = ["main"]

PROMPT_VERSION = "deep_research_v1"
"""Nome do prompt de pesquisa (`prompts/deep_research_v1.md`, patch 12) — gravado em todo run
mesmo antes de o arquivo existir, porque `emit.py` já exige `state["prompt_version"]` hoje."""

_MODELO_ESTRUTURACAO = {"fixture": "fixture", "deepseek": "deepseek-v4-flash"}
_MODELO_PESQUISA = {"none": "relatorio_salvo", "gemini": "deep-research-preview-04-2026"}

_RUNS_DIR_PADRAO = Path("research_pipeline/runs")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m research_pipeline.run")
    parser.add_argument("--ano", type=int, default=None, help="obrigatório salvo com --resume")
    parser.add_argument("--resume", metavar="RUN_ID", default=None)
    parser.add_argument("--report", type=Path, default=None, help="relatório salvo; pula deep_research")
    parser.add_argument("--llm", choices=["fixture", "deepseek"], default=None)
    parser.add_argument("--research", choices=["none", "gemini"], default=None)
    parser.add_argument("--runs-dir", type=Path, default=_RUNS_DIR_PADRAO)
    parser.add_argument("--dry-run", action="store_true", help="só carregador + invariantes")
    args = parser.parse_args(argv)

    import os

    if args.llm is None:
        args.llm = os.environ.get("RP_LLM", "fixture")
    if args.research is None:
        args.research = os.environ.get("RP_RESEARCH", "none")
    return args


def _imprimir_resumo_refs(refs: ReferenceData) -> None:
    aptos = sum(1 for m in refs.municipios.values() if m.apto_licenciar)
    membros = {c for consorcio in refs.consorcios.values() for c in consorcio.membros}
    print(f"{len(refs.municipios)} municípios ({aptos} aptos / {len(refs.municipios) - aptos} não aptos)")
    print(f"{len(refs.consorcios)} consórcios (membros distintos={len(membros)})")
    print(f"data_consulta: {refs.data_consulta}")
    print(f"{len(refs.tipologias)} tipologias · {len(refs.minerais)} minerais")
    print("invariantes: OK")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = _parse_args(argv)

    refs = load_reference_data()

    if args.dry_run:
        _imprimir_resumo_refs(refs)
        return 0

    if args.research == "gemini":
        print("erro: --research gemini chega no patch 14", file=sys.stderr)
        return 2
    if args.resume and args.report:
        print("erro: --resume e --report são mutuamente exclusivos", file=sys.stderr)
        return 2
    if not args.resume and args.ano is None:
        print("erro: --ano é obrigatório fora de --resume", file=sys.stderr)
        return 2

    if args.resume:
        run_id = args.resume
        ano = int(run_id.split("_", 1)[0])
    else:
        ano = args.ano
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_id = f"{ano}_{timestamp}"

    run_dir = args.runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    entrada: dict[str, Any] | None
    if args.resume:
        entrada = None
    else:
        entrada = {"ano": ano, "run_id": run_id, "prompt_version": PROMPT_VERSION}
        if args.report:
            raw_report = args.report.read_text(encoding="utf-8")
            (run_dir / "raw_report.md").write_text(raw_report, encoding="utf-8")
            entrada["raw_report"] = raw_report

    overrides = load_overrides()
    matching_config = load_matching_config()
    ref_index = build_ref_index(refs, overrides, matching_config)
    structurer = get_structurer(args.llm)

    args.runs_dir.mkdir(parents=True, exist_ok=True)
    checkpoints_path = args.runs_dir / "checkpoints.db"
    with SqliteSaver.from_conn_string(str(checkpoints_path)) as checkpointer:
        grafo = build_graph(checkpointer)
        config = {
            "configurable": {
                "thread_id": run_id,
                "refs": refs,
                "ref_index": ref_index,
                "matching_config": matching_config,
                "structurer": structurer,
                "run_dir": run_dir,
                "modelo_pesquisa": _MODELO_PESQUISA[args.research],
                "modelo_estruturacao": _MODELO_ESTRUTURACAO[args.llm],
            }
        }
        try:
            resultado = grafo.invoke(entrada, config=config)
        except ResearchNotConfigured as erro:
            print(f"erro: {erro}", file=sys.stderr)
            return 1

    print(f"run_id: {run_id}")
    for aviso in resultado.get("avisos", []):
        print(f"aviso: {aviso}")
    erros = resultado.get("validation_errors") or []
    if erros:
        print(f"{len(erros)} linha(s) rejeitada(s) na validação:", file=sys.stderr)
        for erro in erros:
            print(f"  {erro}", file=sys.stderr)
    print(f"output: {resultado.get('output_path')}")
    print(f"manifest: {resultado.get('manifest_path')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
