"""CLI: roda um nó de LLM contra a fixture semente e compara com o golden salvo em disco.

Decisão D (patch 8): nós que chamam LLM são verificados por este CLI, não por pytest. `pytest`
mede unidades determinísticas isoladas; comparar um nó de ponta a ponta contra um golden é uma
checagem de regressão de integração — mais barata como comando manual
(`RP_LLM=fixture python -m research_pipeline.tools.check_golden extract`) do que como suíte que
roda a cada `pytest -q`. Sempre com `RP_LLM=fixture` (o default): nunca gasta e nunca precisa de
chave.

Registro `_NOS` é intencionalmente um dict nome→executor: o `normalize` do patch 9 entra como uma
nova entrada, sem reescrever o dispatch nem o formato de saída.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

from research_pipeline.llm import Structurer, get_structurer
from research_pipeline.nodes.extract import extract

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


def _run_extract(structurer: Structurer) -> tuple[dict[str, Any], Path]:
    raw_report = (FIXTURES_DIR / "raw_report_2025_seed.md").read_text(encoding="utf-8")
    state = {"raw_report": raw_report}
    config = {"configurable": {"structurer": structurer}}
    resultado = extract(state, config)
    golden = FIXTURES_DIR / "extracted_2025_seed.golden.json"
    return resultado, golden


_NOS: dict[str, Callable[[Structurer], tuple[dict[str, Any], Path]]] = {
    "extract": _run_extract,
}


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    if len(argv) != 1 or argv[0] not in _NOS:
        print(f"uso: check_golden.py {{{'|'.join(_NOS)}}}", file=sys.stderr)
        return 2
    no = argv[0]

    estruturador = get_structurer(os.environ.get("RP_LLM", "fixture"))
    resultado, golden_path = _NOS[no](estruturador)
    esperado = json.loads(golden_path.read_text(encoding="utf-8"))

    obtido_json = json.dumps(resultado, sort_keys=True, ensure_ascii=False)
    esperado_json = json.dumps(esperado, sort_keys=True, ensure_ascii=False)

    if obtido_json != esperado_json:
        print(f"{no}: DIVERGE do golden {golden_path}", file=sys.stderr)
        print(f"  obtido:   {obtido_json[:1000]}", file=sys.stderr)
        print(f"  esperado: {esperado_json[:1000]}", file=sys.stderr)
        return 1

    total = len(resultado.get("licencas_brutas", []))
    print(f"{no}: OK ({total} linhas, idêntico ao golden)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
