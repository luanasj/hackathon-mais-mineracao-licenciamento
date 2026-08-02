"""Testa `prompts/deep_research_v1.md` (patch 12) — texto puro, sem LLM, sem chave.

O prompt em si é o artefato de maior risco humano do pipeline (§5 do GOAL.md): trava o *formato*
da pesquisa (colunas, ordem, tipos, obrigatoriedade de fonte), nunca o *universo* pesquisado.
Este arquivo faz cumprir mecanicamente as duas garantias que a leitura humana sozinha não
sustenta ao longo do tempo — placeholder único e ausência das listas canônicas (decisão 13) —
mais as regras de conteúdo do §5 que qualquer edição futura do prompt poderia quebrar sem
querer.
"""

from __future__ import annotations

import re
from pathlib import Path

from common.text import fold
from research_pipeline import REPO_ROOT
from research_pipeline.refs import load_reference_data

PROMPT_PATH = REPO_ROOT / "research_pipeline" / "prompts" / "deep_research_v1.md"

COLUNAS_EM_ORDEM = [
    "Município",
    "Consórcio",
    "Órgão emissor",
    "Licenciado por (município próprio / consórcio)",
    "Titular",
    "Substância/Mineral",
    "Tipologia",
    "Nível (1/2/3)",
    "Modalidade (LP/LI/LO/LAU/LU/Renovação)",
    "Nº da licença/portaria",
    "Data (AAAA-MM-DD)",
    "Fonte (URL)",
    "Trecho citado",
]

_PALAVRAS_PROIBICAO = ("não", "nunca", "proib")


def _texto() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def test_ano_ocorre_exatamente_uma_vez() -> None:
    assert _texto().count("{{ANO}}") == 1


def test_treze_colunas_aparecem_na_ordem_exata() -> None:
    texto = _texto()
    posicao_anterior = -1
    for coluna in COLUNAS_EM_ORDEM:
        posicao = texto.find(coluna)
        assert posicao != -1, coluna
        assert posicao > posicao_anterior, coluna
        posicao_anterior = posicao


def test_ranking_so_aparece_dentro_de_frase_de_proibicao() -> None:
    """§5 regra 7: pedir ranking ao LLM convida à invenção de linha para preencher posição —
    toda menção a "ranking"/"ranquear" no prompt tem de estar na mesma frase que a proíbe."""
    texto = _texto()
    for frase in re.split(r"(?<=[.!?])\s+", texto):
        if re.search(r"rank", frase, flags=re.IGNORECASE):
            assert any(palavra in frase.lower() for palavra in _PALAVRAS_PROIBICAO), frase


def test_nao_vaza_listas_canonicas_de_municipio_ou_consorcio() -> None:
    """Decisão 13 (travada, §5 regra 9 do GOAL.md): o prompt de pesquisa não carrega lista de
    municípios nem de consórcios — quem descobre quem licenciou é a pesquisa, não o prompt.
    Meça, não confie: no máximo 3 dos 417 nomes dobrados de município podem aparecer como
    palavra inteira no texto (coincidência de vocabulário comum, ex. topônimos que também são
    palavras do dia a dia), e nenhum dos 29 nomes/siglas de consórcio. Isso é o que impede
    alguém de reintroduzir a lista de 417 sem quebrar este teste.
    """
    refs = load_reference_data()
    texto_dobrado = fold(_texto())

    def aparece_como_palavra_inteira(nome: str) -> bool:
        dobrado = fold(nome)
        if not dobrado:
            return False
        padrao = rf"(?<![a-z0-9]){re.escape(dobrado)}(?![a-z0-9])"
        return re.search(padrao, texto_dobrado) is not None

    municipios_encontrados = [m.nome for m in refs.municipios.values() if aparece_como_palavra_inteira(m.nome)]
    consorcios_encontrados = [c.nome for c in refs.consorcios.values() if aparece_como_palavra_inteira(c.nome)]

    assert len(municipios_encontrados) <= 3, municipios_encontrados
    assert consorcios_encontrados == []


def test_prompt_existe_e_nao_esta_vazio() -> None:
    assert PROMPT_PATH.exists()
    assert len(_texto().strip()) > 0
