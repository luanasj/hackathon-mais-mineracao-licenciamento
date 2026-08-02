"""Contrato de `common.text.fold`, sem tocar em nenhum dado de referência.

A paridade com `scripts/lib/municipios_ba.py:_normalize` e os fatos sobre os 417/29 nomes
ficam em `test_text_parity.py`; aqui só o comportamento da função isolada.
"""

from __future__ import annotations

import pytest

from common.text import APOSTROFOS, TRACOS, fold

CASOS = [
    # (entrada, esperado, por que este caso existe)
    ("Dias d'Ávila", "dias davila", "apóstrofo é removido, não vira espaço (§7.2)"),
    ("Xique-Xique", "xique xique", "hífen vira espaço (§7.2)"),
    ("São João", "sao joao", "til e acento circunflexo saem"),
    ("Caetité", "caetite", "o caso do match fuzzy do patch 6"),
    ("CONSORCIO", "consorcio", "fonte grava sem acento e em caixa alta"),
    ("Consórcio", "consorcio", "relatório grava com acento e em caixa mista"),
    ("  Múltiplos   espaços  ", "multiplos espacos", "colapsa e apara espaços"),
    ("Bacia do Rio Corrente", "bacia do rio corrente", "preposição fica; dobra não é stopword"),
    ("", "", "string vazia não explode"),
    ("   ", "", "só espaço vira vazio"),
]


@pytest.mark.parametrize("entrada,esperado,motivo", CASOS, ids=[c[0] or "vazio" for c in CASOS])
def test_fold(entrada: str, esperado: str, motivo: str) -> None:
    assert fold(entrada) == esperado, motivo


def test_consorcio_dobra_igual_com_e_sem_acento() -> None:
    """A razão de existir da dobra nos consórcios: a fonte grava `CONSORCIO` sem acento e os
    relatórios escrevem `Consórcio`. Sem isso o match exato dos 29 cairia por inteiro (§7.2)."""
    assert fold("CONSORCIO INTERMUNICIPAL") == fold("Consórcio Intermunicipal")


@pytest.mark.parametrize("apostrofo", APOSTROFOS)
def test_todo_apostrofo_desaparece(apostrofo: str) -> None:
    assert fold(f"dias d{apostrofo}avila") == "dias davila"


@pytest.mark.parametrize("traco", TRACOS)
def test_todo_traco_vira_espaco(traco: str) -> None:
    assert fold(f"xique{traco}xique") == "xique xique"


def test_x96_nao_sobrevive() -> None:
    """`\\x96` é o separador real do consórcio 45429 — en-dash mojibake de cp1252.

    Não é whitespace (`'\\x96'.isspace()` é `False`) e o NFKD não o toca, então sem estar em
    `TRACOS` ele sobreviveria à dobra e entraria como token no matcher do patch 6.
    """
    assert "\x96".isspace() is False, "premissa do caso: não dá para confiar no split()"
    dobrado = fold("CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \x96 CISUDOESTE")
    assert dobrado == "consorcio intermunicipal do sudoeste da bahia cisudoeste"
    assert dobrado.isascii()


def test_fold_e_idempotente() -> None:
    """Vale para todo caso da tabela: dobrar o dobrado não muda nada. É o que permite guardar
    a forma dobrada como chave de índice sem se perguntar se ela já passou pela função."""
    for entrada, esperado, _ in CASOS:
        assert fold(esperado) == esperado
        assert fold(fold(entrada)) == fold(entrada)
