"""Testa `research.py` (patch 14) — o cliente Gemini sem rede e sem chave.

Os objetos de resposta são construídos com os **tipos reais** do `google-genai`
(`Interaction`, `ModelOutputStep`, `TextContent`, `URLCitation`), não com duplos de mão: é o que
faz este arquivo falhar se um upgrade do SDK renomear `output_text`, `annotations`,
`start_index`/`end_index` ou os literais de `status`. Um stub caseiro passaria feliz contra um
contrato que não existe mais.

Só o transporte é falso — um objeto com `.interactions.create/.get` que devolve o que o teste
mandou. `genai.Client` nunca é construído, então `GEMINI_API_KEY` nunca é lida.
"""

from __future__ import annotations

from typing import Any

import pytest
from google.genai import interactions as tipos_genai

from research_pipeline.research import (
    AGENTE_PADRAO,
    GeminiDeepResearch,
    ResearchFailed,
    get_research_client,
)

TEXTO = "Caturama concedeu licença em 2025. Tremedal também."


def _interacao(status: str, *, texto: str = TEXTO, anotacoes: list[Any] | None = None) -> Any:
    passo = tipos_genai.ModelOutputStep(
        type="model_output",
        content=[tipos_genai.TextContent(type="text", text=texto, annotations=anotacoes or [])],
    )
    return tipos_genai.Interaction(id="int_1", status=status, steps=[passo])


def _citacao(url: str, titulo: str | None, inicio: int | None, fim: int | None) -> Any:
    return tipos_genai.URLCitation(
        type="url_citation", url=url, title=titulo, start_index=inicio, end_index=fim
    )


class _Interactions:
    def __init__(self, interacao: Any) -> None:
        self._interacao = interacao
        self.kwargs_do_create: dict[str, Any] = {}
        self.ids_do_get: list[str] = []

    def create(self, **kwargs: Any) -> Any:
        self.kwargs_do_create = kwargs
        return self._interacao

    def get(self, interaction_id: str) -> Any:
        self.ids_do_get.append(interaction_id)
        return self._interacao


class _ClienteGenaiFalso:
    def __init__(self, interacao: Any) -> None:
        self.interactions = _Interactions(interacao)


# ------------------------------------------------------------------------------- start


def test_start_devolve_id_e_manda_a_configuracao_do_paragrafo_4() -> None:
    cliente = _ClienteGenaiFalso(_interacao("queued"))
    pesquisa = GeminiDeepResearch(cliente=cliente)

    assert pesquisa.start("pesquise 2025") == "int_1"

    kwargs = cliente.interactions.kwargs_do_create
    assert kwargs["input"] == "pesquise 2025"
    assert kwargs["agent"] == AGENTE_PADRAO
    assert kwargs["background"] is True
    assert kwargs["store"] is True
    assert kwargs["agent_config"] == {
        "type": "deep-research",
        "thinking_summaries": "auto",
        "visualization": "off",
        "collaborative_planning": False,
    }


def test_agent_config_e_aceito_pelo_tipo_real_do_sdk() -> None:
    """`visualization="none"` foi rejeitado na correção 2 do patch 0 — este teste é o que impede
    o valor errado de voltar sem ninguém perceber: o tipo real do SDK valida o dicionário."""
    cliente = _ClienteGenaiFalso(_interacao("queued"))
    GeminiDeepResearch(cliente=cliente).start("x")

    config = tipos_genai.DeepResearchAgentConfig.model_validate(
        cliente.interactions.kwargs_do_create["agent_config"]
    )
    assert config.visualization == "off"
    assert config.collaborative_planning is False


def test_agente_alternativo_chega_na_chamada() -> None:
    cliente = _ClienteGenaiFalso(_interacao("queued"))
    pesquisa = GeminiDeepResearch(cliente=cliente, agente="deep-research-max-preview-04-2026")

    pesquisa.start("x")

    assert cliente.interactions.kwargs_do_create["agent"] == "deep-research-max-preview-04-2026"


# -------------------------------------------------------------------------------- poll


@pytest.mark.parametrize("status", ["queued", "in_progress", "requires_action"])
def test_poll_devolve_none_enquanto_em_andamento(status: str) -> None:
    cliente = _ClienteGenaiFalso(_interacao(status))

    assert GeminiDeepResearch(cliente=cliente).poll("int_1") is None
    assert cliente.interactions.ids_do_get == ["int_1"]


@pytest.mark.parametrize("status", ["failed", "cancelled", "incomplete", "budget_exceeded"])
def test_poll_levanta_em_estado_terminal_que_nao_e_completed(status: str) -> None:
    cliente = _ClienteGenaiFalso(_interacao(status))

    with pytest.raises(ResearchFailed, match=status):
        GeminiDeepResearch(cliente=cliente).poll("int_1")


def test_poll_completed_devolve_texto_e_zero_citacoes() -> None:
    cliente = _ClienteGenaiFalso(_interacao("completed"))

    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert resultado.raw_report == TEXTO
    assert resultado.citations == []


def test_poll_cai_para_os_steps_quando_nao_ha_output_text() -> None:
    """`output_text` é derivado dos `steps` no SDK 2.16, então só um objeto sem ele exercita o
    fallback — daí este ser o único teste do arquivo com duplo caseiro."""

    class _ParteFalsa:
        text = "# do fallback"
        annotations: list[Any] = []

    class _PassoFalso:
        content = [_ParteFalsa()]

    class _InteracaoFalsa:
        status = "completed"
        output_text = None
        steps = [_PassoFalso()]

    cliente = _ClienteGenaiFalso(_InteracaoFalsa())
    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert resultado.raw_report == "# do fallback"


def test_poll_completed_sem_nenhum_texto_levanta() -> None:
    class _InteracaoVazia:
        status = "completed"
        output_text = None
        steps: list[Any] = []

    with pytest.raises(ResearchFailed, match="sem nenhum conteúdo textual"):
        GeminiDeepResearch(cliente=_ClienteGenaiFalso(_InteracaoVazia())).poll("int_1")


# --------------------------------------------------------------------------- citações


def test_citacoes_viram_schema_citation_com_trecho_recortado() -> None:
    anotacoes = [
        _citacao("https://exemplo.invalid/caturama", "Diário de Caturama", 0, 8),
        _citacao("https://exemplo.invalid/tremedal", None, 35, 43),
    ]
    cliente = _ClienteGenaiFalso(_interacao("completed", anotacoes=anotacoes))

    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert resultado.citations == [
        {
            "url": "https://exemplo.invalid/caturama",
            "titulo": "Diário de Caturama",
            "trecho": "Caturama",
            "indice": 0,
        },
        {
            "url": "https://exemplo.invalid/tremedal",
            "titulo": None,
            "trecho": "Tremedal",
            "indice": 1,
        },
    ]


def test_citacoes_deduplicam_por_url_mantendo_a_ordem() -> None:
    anotacoes = [
        _citacao("https://exemplo.invalid/a", "A", 0, 8),
        _citacao("https://exemplo.invalid/a", "A de novo", 35, 43),
        _citacao("https://exemplo.invalid/b", "B", 0, 8),
    ]
    cliente = _ClienteGenaiFalso(_interacao("completed", anotacoes=anotacoes))

    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert [c["url"] for c in resultado.citations] == [
        "https://exemplo.invalid/a",
        "https://exemplo.invalid/b",
    ]
    assert [c["indice"] for c in resultado.citations] == [0, 1]


def test_citacao_sem_indices_fica_com_trecho_nulo() -> None:
    cliente = _ClienteGenaiFalso(
        _interacao("completed", anotacoes=[_citacao("https://exemplo.invalid/a", "A", None, None)])
    )

    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert resultado.citations[0]["trecho"] is None


def test_anotacao_que_nao_e_url_citation_e_ignorada() -> None:
    """`Annotation` é uma união aberta (`word_info`, `place_citation`, `file_citation`…); só a
    `url_citation` tem `url`, e só ela é procedência no sentido do §8."""
    palavra = tipos_genai.WordInfo(type="word_info", word="licença")
    cliente = _ClienteGenaiFalso(_interacao("completed", anotacoes=[palavra]))

    resultado = GeminiDeepResearch(cliente=cliente).poll("int_1")

    assert resultado is not None
    assert resultado.citations == []


# ------------------------------------------------------------------ get_research_client


def test_get_research_client_none_devolve_none() -> None:
    assert get_research_client("none") is None


def test_get_research_client_gemini() -> None:
    cliente = get_research_client("gemini")
    assert isinstance(cliente, GeminiDeepResearch)
    assert cliente.agente == AGENTE_PADRAO


def test_get_research_client_repassa_o_agente() -> None:
    cliente = get_research_client("gemini", agente="deep-research-max-preview-04-2026")
    assert isinstance(cliente, GeminiDeepResearch)
    assert cliente.agente == "deep-research-max-preview-04-2026"


def test_get_research_client_desconhecido() -> None:
    with pytest.raises(ValueError, match="bogus"):
        get_research_client("bogus")


def test_construir_sem_chave_no_ambiente_nao_quebra(monkeypatch: pytest.MonkeyPatch) -> None:
    """Instanciar não pode exigir `GEMINI_API_KEY`: `run.py` monta o cliente antes de saber se o
    run vai pesquisar, e um `--report PATH` nunca chega a usá-lo."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    GeminiDeepResearch()
    get_research_client("gemini")
