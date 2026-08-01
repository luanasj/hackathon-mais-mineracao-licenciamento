"""Contrato e paridade de `common.dbf.read_dbf` contra os dois `.dbf` reais.

Mesmo argumento anti-deriva do `test_text_parity.py`: `read_dbf` é cópia da lógica de
`scripts/lib/municipios_ba.py:_read_dbf` (decisão C), e sem paridade afirmada as duas
implementações passariam a discordar em silêncio.

Os números aqui são medidos, não estimados, e são os mesmos que o patch 4 vai consumir:
`BA.dbf` = 31.858 registros × 12 colunas com 169 `SUBS` distintos.
"""

from __future__ import annotations

import struct

import pytest

from common.dbf import DBASE_III, FLAG_ATIVO, DbfError, read_dbf

from .conftest import DBF_IBGE, DBF_SIGMINE

COLUNAS_SIGMINE = [
    "PROCESSO", "NUMERO", "ANO", "AREA_HA", "ID", "FASE",
    "ULT_EVENTO", "NOME", "SUBS", "USO", "UF", "DSProcesso",
]


@pytest.fixture(scope="module")
def sigmine() -> list[dict[str, str]]:
    return read_dbf(DBF_SIGMINE)


@pytest.fixture(scope="module")
def ibge() -> list[dict[str, str]]:
    return read_dbf(DBF_IBGE)


@pytest.mark.parametrize("path", [DBF_SIGMINE, DBF_IBGE], ids=["BA.dbf", "BA_Municipios_2025.dbf"])
def test_paridade_com_o_original(municipios_ba, path) -> None:
    """`read_dbf` devolve exatamente o que `_read_dbf` devolve nos dois arquivos reais.

    As duas guardas novas (versão e flag de deleção) não mudam o resultado aqui: os dois são
    dBASE III e não têm nenhum registro marcado como deletado.
    """
    assert read_dbf(path) == municipios_ba._read_dbf(path)


def test_sigmine_forma(sigmine: list[dict[str, str]]) -> None:
    """Os números que o patch 4 usa para carregar o vocabulário de minerais."""
    assert len(sigmine) == 31_858
    assert list(sigmine[0]) == COLUNAS_SIGMINE
    assert all(list(r) == COLUNAS_SIGMINE for r in sigmine)


def test_sigmine_tem_169_substancias(sigmine: list[dict[str, str]]) -> None:
    assert len({r["SUBS"] for r in sigmine}) == 169


def test_ibge_forma(ibge: list[dict[str, str]]) -> None:
    assert len(ibge) == 417
    assert len(ibge[0]) == 15
    assert {"CD_MUN", "NM_MUN", "AREA_KM2"} <= set(ibge[0])


def test_ibge_le_acento_intacto(ibge: list[dict[str, str]]) -> None:
    """Prova que o UTF-8 do `.cpg` é o encoding certo.

    Latin-1 não levantaria erro aqui — só devolveria mojibake. É a falha silenciosa que o
    comentário em `scripts/lib/municipios_ba.py:26-28` registra ter acontecido neste repo.
    """
    nomes = {r["NM_MUN"] for r in ibge}
    assert "Caetité" in nomes
    assert "Dias d'Ávila" in nomes
    assert not any("Ã" in n and "ã" not in n.lower() for n in nomes), "cheiro de mojibake"


@pytest.mark.parametrize("fixture_nome", ["sigmine", "ibge"])
def test_todo_valor_e_str_aparada(fixture_nome: str, request) -> None:
    """Contrato do docstring: tudo volta `str` stripado, inclusive os campos numéricos (`N`)."""
    registros = request.getfixturevalue(fixture_nome)
    for r in registros[:200]:
        for chave, valor in r.items():
            assert isinstance(valor, str), (chave, valor)
            assert valor == valor.strip(), (chave, valor)


def test_arquivo_vazio(tmp_path) -> None:
    vazio = tmp_path / "vazio.dbf"
    vazio.write_bytes(b"")
    with pytest.raises(DbfError, match="arquivo vazio"):
        read_dbf(vazio)


def test_versao_nao_suportada(tmp_path) -> None:
    """`0x30` (Visual FoxPro) tem header diferente: o original leria como lixo em silêncio."""
    dados = bytearray(DBF_IBGE.read_bytes())
    dados[0] = 0x30
    falso = tmp_path / "foxpro.dbf"
    falso.write_bytes(dados)
    with pytest.raises(DbfError, match="versão DBF 0x30"):
        read_dbf(falso)


def test_registro_deletado(tmp_path) -> None:
    """Registro marcado com `*`: o original o contaria como ativo e devolveria 417 linhas,
    uma delas lixo. Aqui é falha alta com o índice nomeado."""
    dados = bytearray(DBF_IBGE.read_bytes())
    header_size = struct.unpack("<H", dados[8:10])[0]
    record_size = struct.unpack("<H", dados[10:12])[0]
    assert dados[0] == DBASE_III
    alvo = header_size + 7 * record_size
    assert dados[alvo] == FLAG_ATIVO, "premissa: o registro 7 está ativo no arquivo real"
    dados[alvo] = 0x2A  # '*'
    falso = tmp_path / "deletado.dbf"
    falso.write_bytes(dados)
    with pytest.raises(DbfError, match="registro 7 tem flag de deleção 0x2a"):
        read_dbf(falso)
