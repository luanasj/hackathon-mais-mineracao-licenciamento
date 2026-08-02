"""Grafo LangGraph — liga os nós num pipeline único, checkpoint por run (§3, §9 do GOAL.md).

`research_start -> research -> extract -> normalize -> validate -> {repair | rank_and_emit}`;
`repair -> {extract | normalize}` fecha o laço do §5.

`research_start` e `research` são dois nós, não um, porque o checkpoint só é gravado quando um nó
retorna: o `interaction_id` precisa estar no disco **antes** do polling começar, ou uma morte no
meio da espera repagaria os US$ 1–3 (AC7). Ver o docstring de `nodes/research.py`. Nos runs
offline (`--report`/`--resume`) `research_start` devolve `{}` sem tocar em nada.

`refs` não entra no estado (decisão 18/G): cada nó lê `config["configurable"]["refs"]`/
`["ref_index"]`, montado uma vez por `run.py` antes do primeiro `invoke()` — `load_reference_data()`
já roda em `run.py:main()` "antes de qualquer coisa" (AC8). Não existe nó `load_refs` aqui: `config`
é o mesmo objeto do início ao fim de um `invoke()`, nenhum nó pode reescrevê-lo para os seguintes,
então um nó cujo único papel fosse "carregar refs no config" não teria como entregar o resultado a
ninguém — carga estrutural sem nó que a use, o mesmo motivo que manteve `custo_estimado_usd` fora
do manifesto no patch 10.

**Roteamento do reparo:** volta para `normalize`, nunca para `extract` — erro de id canônico ou de
vocabulário não se corrige retranscrevendo o relatório, e reexecutar `extract` convida o modelo a
inventar linha nova só para satisfazer a mensagem de erro. Só o caso degenerado de zero linhas em
`licencas_brutas` (nada sobreviveu ao Pydantic de `extract`) volta para lá. O texto de
`validation_errors` **não viaja** de volta para `normalize`/`extract` nesta versão — nenhum dos
dois nós aceita esse parâmetro hoje, e o `FixtureStructurer` (decisão D) devolve sempre a mesma
resposta por `tag`, então não há quem leia uma mensagem de erro extra. Adicionar o campo sem um LLM
real (patch 13) que o consuma seria scaffolding sem uso. O que o reparo garante nesta versão é a
contagem de tentativas (`repair_attempts`, máximo 2, §5) e o novo passe pelo nó certo — o conteúdo
da mensagem entra quando existir quem a leia.

**Achado desta sessão, não previsto no plano:** `extract`/`normalize`/`emit` anotam o segundo
parâmetro como `config: dict[str, Any]` — correto para quem os chama direto (`check_golden.py`,
os testes), mas o `StateGraph` do LangGraph inspeciona a **anotação**, não a posição, para decidir
se um parâmetro é o `config` injetável: com qualquer tipo que não seja `RunnableConfig` (ou sem
anotação), ele conclui que o nó só aceita `state` e a chamada falha com
`TypeError: ...() missing 1 required positional argument: 'config'` — medido registrando os quatro
nós direto, sem `_sem_anotacao`. Reanotar os módulos originais acopla-os ao LangGraph só para
satisfazer essa inspeção; `_sem_anotacao` é o wrapper mínimo que devolve os parâmetros ao formato
posicional puro que o `StateGraph` reconhece, sem tocar nos módulos que `check_golden.py` chama
como função Python comum.
"""

from __future__ import annotations

from typing import Any, Callable, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from research_pipeline.nodes.emit import emit
from research_pipeline.nodes.extract import extract
from research_pipeline.nodes.normalize import normalize
from research_pipeline.nodes.research import research, research_start
from research_pipeline.nodes.validate import validate_licencas
from research_pipeline.refs import ReferenceData

__all__ = [
    "PipelineState",
    "REPAIR_ATTEMPTS_MAXIMO",
    "apos_repair",
    "apos_validate",
    "build_graph",
    "repair",
    "validate_node",
]

REPAIR_ATTEMPTS_MAXIMO = 2
"""§5: no máximo 2 tentativas de reparo."""


class PipelineState(TypedDict, total=False):
    """§3 do GOAL.md, menos `refs` (decisão G) — as chaves nascem aos poucos, um nó por vez, daí
    `total=False`: o estado inicial de um run novo só traz `ano`/`run_id`/`prompt_version`."""

    ano: int
    run_id: str
    prompt_version: str
    interaction_id: str | None
    raw_report: str | None
    citations: list[dict[str, Any]]
    licencas_brutas: list[dict[str, Any]]
    licencas_normalizadas: list[dict[str, Any]]
    validation_errors: list[str]
    avisos: list[str]
    repair_attempts: int
    output_path: str | None
    manifest_path: str | None


def validate_node(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Nó em torno de `validate_licencas` (patch 7, função pura): substitui
    `licencas_normalizadas` pelo subconjunto que passou nas regras duras — `rank_and_emit` nunca vê
    uma linha que `validate_licencas` teria rejeitado — e acrescenta avisos aos que `normalize` já
    produziu (os dois nós enxergam ângulos diferentes do mesmo lote, ver o docstring de
    `normalize.py`)."""
    refs: ReferenceData = config["configurable"]["refs"]
    validas, erros, avisos = validate_licencas(state.get("licencas_normalizadas", []), refs)
    return {
        "licencas_normalizadas": [v.model_dump(mode="json") for v in validas],
        "validation_errors": erros,
        "avisos": [*state.get("avisos", []), *avisos],
    }


def repair(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Só conta a tentativa — ver o docstring do módulo sobre por que nenhuma mensagem de erro
    viaja daqui para `normalize`/`extract` nesta versão."""
    return {"repair_attempts": state.get("repair_attempts", 0) + 1}


def apos_validate(state: dict[str, Any]) -> str:
    if state.get("validation_errors") and state.get("repair_attempts", 0) < REPAIR_ATTEMPTS_MAXIMO:
        return "repair"
    return "rank_and_emit"


def apos_repair(state: dict[str, Any]) -> str:
    """Zero linhas em `licencas_brutas` é o único caso degenerado que volta para `extract` — todo
    outro erro duro (id, vocabulário, formato) volta para `normalize`, que é quem os produziu."""
    return "extract" if not state.get("licencas_brutas") else "normalize"


def _sem_anotacao(no: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]):
    """Ver o docstring do módulo: devolve `no` por trás de um `(state, config)` sem anotação de
    tipo, o formato que o `StateGraph` reconhece como `config` injetável."""

    def executar(state, config):
        return no(state, config)

    return executar


def build_graph(checkpointer: BaseCheckpointSaver) -> CompiledStateGraph:
    """`(checkpointer) -> CompiledStateGraph`. `refs`/`ref_index`/`structurer`/`run_dir` chegam por
    `config["configurable"]` em todo `invoke()` (decisão 18) — nunca pelo estado."""
    grafo = StateGraph(PipelineState)
    grafo.add_node("research_start", _sem_anotacao(research_start))
    grafo.add_node("research", _sem_anotacao(research))
    grafo.add_node("extract", _sem_anotacao(extract))
    grafo.add_node("normalize", _sem_anotacao(normalize))
    grafo.add_node("validate", _sem_anotacao(validate_node))
    grafo.add_node("repair", _sem_anotacao(repair))
    grafo.add_node("rank_and_emit", _sem_anotacao(emit))

    grafo.add_edge(START, "research_start")
    grafo.add_edge("research_start", "research")
    grafo.add_edge("research", "extract")
    grafo.add_edge("extract", "normalize")
    grafo.add_edge("normalize", "validate")
    grafo.add_conditional_edges("validate", apos_validate, ["repair", "rank_and_emit"])
    grafo.add_conditional_edges("repair", apos_repair, ["extract", "normalize"])
    grafo.add_edge("rank_and_emit", END)

    return grafo.compile(checkpointer=checkpointer)
