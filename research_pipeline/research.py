"""Camada de pesquisa — `ResearchClient` Protocol, cliente Gemini real e fake (patch 14, US$ 1–3).

Mesmo desenho de `llm.py` (patch 8): um `Protocol` estreito, uma implementação real e uma de
teste, escolhidas por nome em `get_research_client()`. O que o nó `research` enxerga são dois
métodos — `start(prompt) -> interaction_id` e `poll(interaction_id) -> ResearchResult | None` —
e essa fronteira é o que torna o AC7 testável de graça: `FakeResearchClient` conta `start()` sem
rede, sem chave e sem gastar os US$ 1–3.

**`poll` devolve `None` enquanto a tarefa não terminou**, em vez de bloquear. Quem espera é o nó
(`nodes/research.py`), não o cliente — é lá que o `poll_timeout` mora, e é lá que a retomada
precisa poder desistir sem perder o `interaction_id`. Um cliente que bloqueasse até completar
esconderia o único ponto do pipeline onde vale a pena morrer e retomar.

**Texto final:** o SDK 2.16 expõe `Interaction.output_text`, que é o acessor documentado e já
concatena o conteúdo textual da resposta. O plano previa `steps[-1].content[0].text`; isso fica
como *fallback* — varredura dos `steps` de trás para frente atrás do primeiro texto — porque um
passo final sem texto (visualização, thought summary) tornaria o índice fixo `[0]` frágil.

**Citações** saem das `annotations` do tipo `url_citation` penduradas em cada `TextContent`
(`start_index`/`end_index` recortam o trecho no próprio texto anotado), deduplicadas por URL na
ordem em que aparecem, e viram `schemas.Citation` — o mesmo tipo que o §3 já nomeava em
`PipelineState.citations` e que até aqui nada preenchia.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol

from research_pipeline.schemas import Citation

__all__ = [
    "AGENTE_PADRAO",
    "FakeResearchClient",
    "GeminiDeepResearch",
    "ResearchClient",
    "ResearchFailed",
    "ResearchResult",
    "get_research_client",
]

AGENTE_PADRAO = "deep-research-preview-04-2026"
"""`deep-research-max-preview-04-2026` é o irmão caro (US$ 3–7, §4) — trocável por
`--research-model`, nunca por edição de código."""

_STATUS_EM_ANDAMENTO = frozenset({"queued", "in_progress", "requires_action"})
_STATUS_CONCLUIDO = "completed"

_AGENT_CONFIG = {
    "type": "deep-research",
    "thinking_summaries": "auto",
    "visualization": "off",
    "collaborative_planning": False,
}
"""§4: flags vão **dentro** de `agent_config`, não como kwargs soltos; `visualization` aceita só
`"auto"`/`"off"`; `collaborative_planning` desligado porque introduz variação entre execuções."""


class ResearchFailed(Exception):
    """A tarefa chegou a um estado terminal que não é `completed` (`failed`, `cancelled`,
    `incomplete`, `budget_exceeded`) — retomar o mesmo `interaction_id` não a ressuscita."""


@dataclass(frozen=True)
class ResearchResult:
    raw_report: str
    citations: list[dict[str, Any]]


class ResearchClient(Protocol):
    def start(self, prompt: str) -> str: ...

    def poll(self, interaction_id: str) -> ResearchResult | None: ...


def _texto_final(interacao: Any) -> str:
    texto = getattr(interacao, "output_text", None)
    if texto:
        return texto
    for passo in reversed(getattr(interacao, "steps", None) or []):
        for parte in getattr(passo, "content", None) or []:
            if getattr(parte, "text", None):
                return parte.text
    raise ResearchFailed("interação concluída sem nenhum conteúdo textual")


def _citacoes(interacao: Any) -> list[dict[str, Any]]:
    citacoes: list[dict[str, Any]] = []
    vistas: set[str] = set()
    for passo in getattr(interacao, "steps", None) or []:
        for parte in getattr(passo, "content", None) or []:
            texto = getattr(parte, "text", None) or ""
            for anotacao in getattr(parte, "annotations", None) or []:
                url = getattr(anotacao, "url", None)
                if not url or url in vistas:
                    continue
                vistas.add(url)
                inicio = getattr(anotacao, "start_index", None)
                fim = getattr(anotacao, "end_index", None)
                trecho = texto[inicio:fim] if inicio is not None and fim is not None else None
                citacoes.append(
                    Citation(
                        url=url,
                        titulo=getattr(anotacao, "title", None),
                        trecho=trecho or None,
                        indice=len(citacoes),
                    ).model_dump(mode="json")
                )
    return citacoes


class GeminiDeepResearch:
    """`ResearchClient` real sobre `google-genai` (Interactions API, §4).

    O `genai.Client` é construído na **primeira** chamada, não no construtor: `run.py` monta o
    cliente antes de saber se o run vai mesmo pesquisar (um `--report PATH` pula o nó inteiro), e
    exigir `GEMINI_API_KEY` para instanciar transformaria um run offline em falha de ambiente.
    """

    def __init__(self, *, cliente: Any = None, agente: str = AGENTE_PADRAO) -> None:
        self._cliente = cliente
        self._agente = agente

    @property
    def agente(self) -> str:
        return self._agente

    def _conectar(self) -> Any:
        if self._cliente is None:
            from google import genai

            self._cliente = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        return self._cliente

    def start(self, prompt: str) -> str:
        interacao = self._conectar().interactions.create(
            input=prompt,
            agent=self._agente,
            background=True,
            store=True,
            agent_config=dict(_AGENT_CONFIG),
        )
        return interacao.id

    def poll(self, interaction_id: str) -> ResearchResult | None:
        interacao = self._conectar().interactions.get(interaction_id)
        status = getattr(interacao, "status", None)
        if status in _STATUS_EM_ANDAMENTO:
            return None
        if status != _STATUS_CONCLUIDO:
            raise ResearchFailed(f"{interaction_id}: status terminal {status!r}")
        return ResearchResult(raw_report=_texto_final(interacao), citations=_citacoes(interacao))


class FakeResearchClient:
    """`ResearchClient` de teste — conta `start()`/`poll()` e devolve `None` até o
    `polls_ate_concluir`-ésimo poll, para simular a tarefa ainda em andamento."""

    def __init__(self, resultado: ResearchResult, *, polls_ate_concluir: int = 1) -> None:
        self._resultado = resultado
        self._polls_ate_concluir = polls_ate_concluir
        self.starts = 0
        self.polls = 0
        self.prompts: list[str] = []
        self.ids_pollados: list[str] = []

    def start(self, prompt: str) -> str:
        self.starts += 1
        self.prompts.append(prompt)
        return f"fake-interaction-{self.starts}"

    def poll(self, interaction_id: str) -> ResearchResult | None:
        self.polls += 1
        self.ids_pollados.append(interaction_id)
        if self.polls < self._polls_ate_concluir:
            return None
        return self._resultado


def get_research_client(nome: str, *, agente: str = AGENTE_PADRAO) -> ResearchClient | None:
    """`"none"` devolve `None` — ausência de cliente é o estado normal do caminho offline, não um
    erro; quem transforma isso em falha é o nó, e só quando não há relatório salvo."""
    if nome == "none":
        return None
    if nome == "gemini":
        return GeminiDeepResearch(agente=agente)
    raise ValueError(f"camada de pesquisa desconhecida: {nome!r}")
