"""Testa a derivação mecânica de aliases (patch 5), sem nenhum matching ainda (patch 6).

Dois blocos: **positivos**, contra os 29 consórcios e os 417 municípios reais; **negativos**,
corrompendo `config/aliases.yaml` em `tmp_path`, um problema por vez, no mesmo padrão de
`test_refs.py` e `test_vocab.py` — a mensagem nomeia o defeito, não só o tipo da exceção.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from research_pipeline.aliases import (
    ALIASES_PATH,
    ConsorcioAliases,
    RefLoadError,
    derive_consorcio_aliases,
    derive_municipio_aliases,
    load_overrides,
)
from research_pipeline.refs import ReferenceData, load_reference_data

# --------------------------------------------------------------------------- fixtures


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


@pytest.fixture(scope="module")
def aliases_por_consorcio(refs: ReferenceData) -> dict[str, ConsorcioAliases]:
    return {cid: derive_consorcio_aliases(c.nome) for cid, c in refs.consorcios.items()}


# --------------------------------------------------------------------------- positivos, consórcio


def test_quatorze_consorcios_tem_sigla(aliases_por_consorcio: dict[str, ConsorcioAliases]) -> None:
    """Snapshot medido nos 29 nomes reais: 14 trazem `" - SIGLA"` (ou o mojibake), 15 não."""
    com_sigla = {cid for cid, a in aliases_por_consorcio.items() if a.sigla is not None}
    assert len(com_sigla) == 14


SIGLAS_MEDIDAS = {
    "8565": "CIAPRA",
    "8801": "CIMURC",
    "9273": "CONSID",
    "9546": "CIMA",
    "9742": "CONSISAL",
    "10247": "COTEMESB",
    "11048": "CONDESC",
    "23423": "CONSTRUIR",
    "29296": "CTR",
    "29302": "CIVALERG",
    "29308": "CIBARC",
    "29311": "CONSTESF",
    "29323": "CISAN",
    "45429": "CISUDOESTE",
}


def test_siglas_batem_com_o_snapshot(aliases_por_consorcio: dict[str, ConsorcioAliases]) -> None:
    """As 14 siglas, nomeadas — não só a contagem. Trava qual consórcio tem qual sigla."""
    extraidas = {cid: a.sigla for cid, a in aliases_por_consorcio.items() if a.sigla is not None}
    assert extraidas == SIGLAS_MEDIDAS


def test_cisudoeste_via_mojibake(aliases_por_consorcio: dict[str, ConsorcioAliases]) -> None:
    """`45429` traz o separador como `\\x96`, não `"-"`. Prova que `SEPARADOR_SIGLA` o alcança."""
    nome = "CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \x96 CISUDOESTE"
    assert "\x96" in nome
    aliases = derive_consorcio_aliases(nome)
    assert aliases.sigla == "CISUDOESTE"
    assert aliases.folded == "consorcio intermunicipal do sudoeste da bahia"


CHAVE_CURTA_MEDIDA = {
    "9742": "sisal",
    "8108": "portal do sertao",
    "29308": "bacia do rio corrente",
    "9273": "oeste",
    "29296": "reconcavo",
    "29310": "somar",
}


def test_chave_curta_bate_com_o_snapshot(
    aliases_por_consorcio: dict[str, ConsorcioAliases],
) -> None:
    """As seis mais nomeadas no plano e as duas mais simples, de ponta a ponta na cascata."""
    for consorcio_id, esperada in CHAVE_CURTA_MEDIDA.items():
        assert aliases_por_consorcio[consorcio_id].chave_curta == esperada, consorcio_id


def test_chave_curta_e_none_quando_a_cascata_nao_descasca_nada() -> None:
    """Nome fictício sem nenhum dos tokens da cascata: `chave_curta` não repete `folded`."""
    aliases = derive_consorcio_aliases("Aliança Municipal Fantasia")
    assert aliases.chave_curta is None
    assert aliases.folded == "alianca municipal fantasia"


def test_sigla_vem_do_nome_cru_nunca_do_dobrado() -> None:
    """Se a sigla saísse da dobra ela perderia a caixa alta e deixaria de ser distinguível do
    resto do nome dobrado — a checagem teria de adivinhar onde ela termina."""
    aliases = derive_consorcio_aliases("Consorcio Teste - ABCDE")
    assert aliases.sigla == "ABCDE"
    assert aliases.folded == "consorcio teste"


def test_segmento_apos_separador_nao_maiusculo_nao_e_sigla() -> None:
    """Hífen que não separa sigla (nome com espaço ou minúscula depois) não é partido — o nome
    inteiro entra como base, senão um nome legítimo com hífen interno seria truncado."""
    aliases = derive_consorcio_aliases("Consorcio Alto - Baixo")
    assert aliases.sigla is None
    assert aliases.folded == "consorcio alto baixo"


def test_todas_as_siglas_sao_um_unico_token_maiusculo(
    aliases_por_consorcio: dict[str, ConsorcioAliases],
) -> None:
    import re

    for consorcio_id, aliases in aliases_por_consorcio.items():
        if aliases.sigla is not None:
            assert re.fullmatch(r"[A-Z]+", aliases.sigla), consorcio_id


def test_tokens_nao_vazio_nas_29(aliases_por_consorcio: dict[str, ConsorcioAliases]) -> None:
    for consorcio_id, aliases in aliases_por_consorcio.items():
        assert aliases.tokens, consorcio_id
        assert aliases.tokens == frozenset(aliases.folded.split())


# --------------------------------------------------------------------------- positivos, município


@pytest.mark.parametrize(
    "nome,esperado",
    [
        ("Barra do Choça", frozenset({"barra do choca", "barra choca"})),
        ("Bom Jesus da Lapa", frozenset({"bom jesus da lapa", "bom jesus lapa"})),
        ("Dias d'Ávila", frozenset({"dias davila"})),
        ("Conde", frozenset({"conde"})),
        ("Xique-Xique", frozenset({"xique xique"})),
    ],
)
def test_alias_de_municipio(nome: str, esperado: frozenset[str]) -> None:
    assert derive_municipio_aliases(nome) == esperado


def test_alias_de_municipio_nao_gera_string_vazia() -> None:
    """`"Conde"` não tem conectivo: a variante sem conectivo não pode virar `""` nem duplicar."""
    assert "" not in derive_municipio_aliases("Conde")


def test_todos_os_417_tem_pelo_menos_um_alias(refs: ReferenceData) -> None:
    for municipio in refs.municipios.values():
        aliases = derive_municipio_aliases(municipio.nome)
        assert aliases
        assert all(a for a in aliases)  # nenhuma string vazia


# --------------------------------------------------------------------------- overrides, positivo


def test_override_real_santa_teresinha() -> None:
    """O único `ALIASES` real, migrado de `scripts/lib/municipios_ba.py:67`. Ver GOAL.md §7.2."""
    overrides = load_overrides(ALIASES_PATH)
    assert overrides.municipios["2928505"] == frozenset({"santa teresinha"})
    assert overrides.consorcios == {}


# --------------------------------------------------------------------------- overrides, negativo


def _escrever(tmp_path: Path, conteudo: str) -> Path:
    caminho = tmp_path / "aliases.yaml"
    caminho.write_text(conteudo, encoding="utf-8")
    return caminho


def test_arquivo_ausente(tmp_path: Path) -> None:
    with pytest.raises(RefLoadError, match="overrides de alias ausentes"):
        load_overrides(tmp_path / "nao_existe.yaml")


def test_yaml_invalido(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "municipios: [nao fecha\n")
    with pytest.raises(RefLoadError, match="YAML inválido"):
        load_overrides(caminho)


def test_topo_nao_e_mapeamento(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "- so\n- uma\n- lista\n")
    with pytest.raises(RefLoadError, match="esperado mapeamento no topo"):
        load_overrides(caminho)


def test_municipios_nao_e_mapeamento(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "municipios: [\"nao\", \"e\", \"mapa\"]\nconsorcios: {}\n")
    with pytest.raises(RefLoadError, match="`municipios` deve ser mapeamento"):
        load_overrides(caminho)


def test_alias_de_municipio_nao_e_lista_de_strings(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, 'municipios:\n  "123": "nao e lista"\nconsorcios: {}\n')
    with pytest.raises(RefLoadError, match=r"municipios\['123'\\?\] deve ser lista de strings"):
        load_overrides(caminho)


def test_consorcios_nao_e_mapeamento(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, "municipios: {}\nconsorcios: [1, 2]\n")
    with pytest.raises(RefLoadError, match="`consorcios` deve ser mapeamento"):
        load_overrides(caminho)


def test_registro_de_consorcio_nao_e_objeto(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, 'municipios: {}\nconsorcios:\n  "1": "nao e objeto"\n')
    with pytest.raises(RefLoadError, match=r"consorcios\['1'\\?\] deve ser objeto"):
        load_overrides(caminho)


def test_sigla_de_override_com_tipo_errado(tmp_path: Path) -> None:
    caminho = _escrever(tmp_path, 'municipios: {}\nconsorcios:\n  "1":\n    sigla: 123\n')
    with pytest.raises(RefLoadError, match="sigla.*deve ser string ou null"):
        load_overrides(caminho)


def test_aliases_de_override_nao_e_lista_de_strings(tmp_path: Path) -> None:
    caminho = _escrever(
        tmp_path, 'municipios: {}\nconsorcios:\n  "1":\n    aliases: [1, 2]\n'
    )
    with pytest.raises(RefLoadError, match="aliases.*deve ser lista de strings"):
        load_overrides(caminho)


def test_sigla_null_e_aceita(tmp_path: Path) -> None:
    """`sigla: null` é a forma explícita de "sem override de sigla", não erro."""
    caminho = _escrever(tmp_path, 'municipios: {}\nconsorcios:\n  "1":\n    sigla: null\n')
    overrides = load_overrides(caminho)
    assert overrides.consorcios["1"].sigla is None
