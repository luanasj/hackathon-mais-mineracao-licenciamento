"""Testa o matcher determinístico (patch 6) contra os 417 municípios e 29 consórcios reais.

Positivos: round-trip exato dos nomes oficiais, alias (sigla, `chave_curta`, override) e as
duas armadilhas travadas nas decisões 4 e 16 do `GOAL.md` — consórcio nunca vira `nenhum`,
município abaixo do piso vira. Negativos: `load_matching_config` corrompido, no mesmo padrão de
`test_aliases.py` — mensagem nomeia o defeito.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from research_pipeline.aliases import derive_consorcio_aliases, load_overrides
from research_pipeline.errors import RefLoadError
from research_pipeline.matcher import (
    MATCHING_CONFIG_PATH,
    Match,
    RefIndex,
    build_ref_index,
    load_matching_config,
)
from research_pipeline.refs import ReferenceData, load_reference_data

# --------------------------------------------------------------------------- fixtures


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


@pytest.fixture(scope="module")
def index(refs: ReferenceData) -> RefIndex:
    return build_ref_index(refs, load_overrides(), load_matching_config())


# --------------------------------------------------------------------------- config


def test_config_real_carrega_os_sete_campos() -> None:
    config = load_matching_config(MATCHING_CONFIG_PATH)
    assert config.confianca_exato == 1.0
    assert config.confianca_alias == 0.92
    assert config.municipio_fuzzy_minimo == 0.60
    assert config.consorcio_fuzzy_minimo == 0.0
    assert config.fuzzy_delta_ambiguidade == 0.05
    assert config.confianca_aviso == 0.7
    assert config.confianca_heranca == 0.5


# --------------------------------------------------------------------------- positivos, exato


def test_todos_os_417_municipios_match_exato(refs: ReferenceData, index: RefIndex) -> None:
    for municipio_id, municipio in refs.municipios.items():
        r = index.match_municipio(municipio.nome)
        assert r.id == municipio_id, municipio.nome
        assert r.metodo == "exato", municipio.nome
        assert r.confianca == 1.0
        assert not r.ambiguo


def test_todos_os_29_consorcios_match_exato(refs: ReferenceData, index: RefIndex) -> None:
    """Nome oficial de 14 consórcios traz a sigla colada (`"... - COTEMESB"`). O matcher tem de
    particionar antes de comparar — senão o próprio nome cru cairia em `alias`, não `exato`."""
    for consorcio_id, consorcio in refs.consorcios.items():
        r = index.match_consorcio(consorcio.nome)
        assert r.id == consorcio_id, consorcio.nome
        assert r.metodo == "exato", consorcio.nome
        assert r.confianca == 1.0
        assert not r.ambiguo


# --------------------------------------------------------------------------- positivos, alias


def test_todas_as_siglas_resolvem_via_alias(refs: ReferenceData, index: RefIndex) -> None:
    """Não hardcoda quais 14 têm sigla — isso já é travado em `test_aliases.py`. Aqui só confere
    que, para quem tem, a sigla sozinha resolve pelo `matcher`."""
    com_sigla = 0
    for consorcio_id, consorcio in refs.consorcios.items():
        sigla = derive_consorcio_aliases(consorcio.nome).sigla
        if sigla is None:
            continue
        com_sigla += 1
        r = index.match_consorcio(sigla)
        assert r.id == consorcio_id, sigla
        assert r.metodo == "alias", sigla
        assert r.confianca == 0.92
    assert com_sigla == 14


@pytest.mark.parametrize(
    "raw,consorcio_id",
    [
        ("CIVALERG", "29302"),
        ("Consórcio Bacia do Paramirim", "14618"),
        ("Consórcio Portal do Sertão", "8108"),
        ("Consórcio Piemonte do Paraguaçu", "29322"),
        ("Consórcio do Vale do Rio Gavião", "29302"),
    ],
)
def test_formas_curtas_reais_do_teste_manual(
    index: RefIndex, raw: str, consorcio_id: str
) -> None:
    """As quatro formas curtas + a sigla isolada são as strings reais do teste manual (§ patch 6
    do plano) — nenhuma bate o nome oficial inteiro, só o que sobra depois de descascar o
    boilerplate (`chave_curta`) ou a sigla."""
    r = index.match_consorcio(raw)
    assert r.id == consorcio_id, raw
    assert r.metodo == "alias", raw


def test_override_santa_teresinha_via_alias(index: RefIndex) -> None:
    r = index.match_municipio("Santa Teresinha")
    assert r.id == "2928505"
    assert r.metodo == "alias"
    assert r.confianca == 0.92


# --------------------------------------------------------------------------- positivos, fuzzy


def test_acento_e_neutralizado_pela_dobra_e_vira_exato(index: RefIndex) -> None:
    """`fold` remove combinantes dos dois lados — `"Caetite"` sem acento e `"Caetitê"` com acento
    errado colam no mesmo `fold` que `"Caetité"` oficial. Não é fuzzy: é exato, porque a dobra já
    resolveu a diferença antes do `rapidfuzz` entrar."""
    for raw in ("Caetite", "Caetitê", "CAETITÉ"):
        r = index.match_municipio(raw)
        assert r.id == "2905206", raw
        assert r.metodo == "exato", raw


def test_typo_real_vira_fuzzy_alto(index: RefIndex) -> None:
    """`"Caetitte"` (consoante duplicada) não neutraliza por dobra — é diferença de letra, não de
    acento. Prova o caminho `fuzzy` com um score medido, não hipotético."""
    r = index.match_municipio("Caetitte")
    assert r.id == "2905206"
    assert r.metodo == "fuzzy"
    assert r.confianca >= 0.90


def test_municipio_abaixo_do_piso_vira_nenhum(index: RefIndex) -> None:
    """`"Bacia do Paramirim (Região)"` é nome de território de consórcio, não de município — a
    linha real do PROMPT 2 que a decisão 16 existe para capturar. Mede 0,58, abaixo do piso de
    0,60: `id`/`nome` viram `None`, mas `candidatos` continua populado."""
    r = index.match_municipio("Bacia do Paramirim (Região)")
    assert r.id is None
    assert r.nome is None
    assert r.metodo == "nenhum"
    assert r.confianca < 0.60
    assert len(r.candidatos) == 5
    assert all(nome for _, nome, _ in r.candidatos)


@pytest.mark.parametrize(
    "raw", ["xxxxxxxxxxxxxxxxxxxx", "qwertyuiopasdfghjkl", "Consórcio Inexistente Nenhum"]
)
def test_consorcio_nunca_vira_nenhum(index: RefIndex, raw: str) -> None:
    """Decisão 4: consórcio sempre recebe o mais próximo, mesmo para lixo puro — diferente do
    município, não há piso que zere `id`."""
    r = index.match_consorcio(raw)
    assert r.id is not None
    assert r.nome is not None
    assert r.metodo != "nenhum"


def test_ambiguo_quando_top_dois_ficam_dentro_do_delta(index: RefIndex) -> None:
    """`"Santa Rita"` mede 0,783 contra Santa Brígida e 0,762 contra Santa Luzia — diferença
    0,021, dentro do `fuzzy_delta_ambiguidade` de 0,05. Acima do piso: recebe `id`, mas marcado
    `ambiguo` para ir ao LLM desempatador do patch 9."""
    r = index.match_municipio("Santa Rita")
    assert r.ambiguo
    assert r.id is not None
    assert r.candidatos[0][2] - r.candidatos[1][2] < 0.05


def test_nao_ambiguo_quando_top_dois_ficam_fora_do_delta(index: RefIndex) -> None:
    """Contraprova do teste acima: `"Bacia do Paramirim (Região)"` mede 0,58 contra Cabaceiras do
    Paraguaçu e 0,50 contra Paramirim — diferença 0,08, fora do delta."""
    r = index.match_municipio("Bacia do Paramirim (Região)")
    assert not r.ambiguo
    assert r.candidatos[0][2] - r.candidatos[1][2] >= 0.05


# --------------------------------------------------------------------------- candidatos


@pytest.mark.parametrize("raw", ["Riacho", "Serra Grande", "Nova Esperança"])
def test_candidatos_top5_ordenados_e_limitados(index: RefIndex, raw: str) -> None:
    r = index.match_municipio(raw)
    assert len(r.candidatos) <= 5
    scores = [c[2] for c in r.candidatos]
    assert scores == sorted(scores, reverse=True)


def test_match_e_frozen(index: RefIndex) -> None:
    r = index.match_municipio("Conde")
    with pytest.raises(AttributeError):
        r.id = "outro"  # type: ignore[misc]
    assert isinstance(r, Match)


# --------------------------------------------------------------------------- negativos, config


def _escrever(tmp_path: Path, conteudo: str) -> Path:
    caminho = tmp_path / "matching.yaml"
    caminho.write_text(conteudo, encoding="utf-8")
    return caminho


_YAML_COMPLETO = """
confianca_exato: 1.0
confianca_alias: 0.92
municipio_fuzzy_minimo: 0.60
consorcio_fuzzy_minimo: 0.0
fuzzy_delta_ambiguidade: 0.05
confianca_aviso: 0.7
confianca_heranca: 0.5
"""


def test_arquivo_ausente(tmp_path: Path) -> None:
    with pytest.raises(RefLoadError, match="configuração de matching ausente"):
        load_matching_config(tmp_path / "nao_existe.yaml")


def test_yaml_invalido(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "confianca_exato: [nao fecha\n")
    with pytest.raises(RefLoadError, match="YAML inválido"):
        load_matching_config(caminho)


def test_topo_nao_e_mapeamento(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "- so\n- uma\n- lista\n")
    with pytest.raises(RefLoadError, match="esperado mapeamento no topo"):
        load_matching_config(caminho)


def test_campo_ausente(tmp_path: Path) -> None:
    incompleto = _YAML_COMPLETO.replace("confianca_heranca: 0.5\n", "")
    caminho = _escrever(tmp_path, incompleto)
    with pytest.raises(RefLoadError, match=r"campo 'confianca_heranca' ausente"):
        load_matching_config(caminho)


def test_campo_com_tipo_errado(tmp_path: Path) -> None:
    corrompido = _YAML_COMPLETO.replace("municipio_fuzzy_minimo: 0.60", 'municipio_fuzzy_minimo: "alto"')
    caminho = _escrever(tmp_path, corrompido)
    with pytest.raises(RefLoadError, match=r"deve ser número"):
        load_matching_config(caminho)


def test_campo_booleano_e_rejeitado(tmp_path: Path) -> None:
    """`isinstance(True, int)` é `True` em Python — sem a checagem explícita, `true` no YAML
    passaria como `1.0` em silêncio."""
    corrompido = _YAML_COMPLETO.replace("consorcio_fuzzy_minimo: 0.0", "consorcio_fuzzy_minimo: true")
    caminho = _escrever(tmp_path, corrompido)
    with pytest.raises(RefLoadError, match=r"deve ser número"):
        load_matching_config(caminho)
