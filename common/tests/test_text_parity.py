"""Paridade entre `common.text.fold` e `scripts/lib/municipios_ba.py:_normalize`.

Existe por causa da decisão C: `scripts/lib/municipios_ba.py` **não é tocado** — código de
coleta que já funciona fica intacto — e `common/text.py` é uma cópia com duas divergências
deliberadas. Sem este teste as duas implementações derivariam em silêncio, e o casamento de
nomes do §6.2 passaria a depender de qual módulo o chamador importou.

As duas divergências são afirmadas **positivamente**: os dois nomes têm de divergir, com os
valores exatos dos dois lados. Assim, tanto apagar a divergência quanto acrescentar uma
terceira quebra alto.
"""

from __future__ import annotations

import pytest

from common.text import fold

# nome -> (fold esperado, _normalize esperado). Único lugar onde as duas implementações
# podem discordar; ver o docstring de `common/text.py`.
DIVERGENCIAS = {
    "Dias d'Ávila": ("dias davila", "dias d avila"),
    "Xique-Xique": ("xique xique", "xique-xique"),
}


@pytest.fixture(scope="module")
def nomes(municipios_ba) -> list[str]:
    """Os 417 nomes de município, direto do DBF do IBGE."""
    todos = [m["municipio"] for m in municipios_ba.load_municipios()]
    assert len(todos) == 417, f"esperado 417 municípios, veio {len(todos)}"
    return todos


def test_paridade_nos_417_exceto_as_divergencias(municipios_ba, nomes: list[str]) -> None:
    discordam = {n for n in nomes if fold(n) != municipios_ba._normalize(n)}
    assert discordam == set(DIVERGENCIAS), (
        "o conjunto de divergências mudou; se foi de propósito, atualize DIVERGENCIAS e o "
        "docstring de common/text.py — os dois documentam o mesmo contrato"
    )


@pytest.mark.parametrize("nome,esperado", sorted(DIVERGENCIAS.items()))
def test_divergencias_sao_exatamente_estas(
    municipios_ba, nome: str, esperado: tuple[str, str]
) -> None:
    """Divergir não basta: cada lado tem de devolver o valor exato que o §7.2 fixa."""
    fold_esperado, normalize_esperado = esperado
    assert fold(nome) == fold_esperado
    assert municipios_ba._normalize(nome) == normalize_esperado
    assert fold(nome) != municipios_ba._normalize(nome)


def test_dobra_dos_417_nao_colide(nomes: list[str]) -> None:
    """A afirmação do §7.2 de que "a dobra sozinha é chave única".

    É premissa do match exato do patch 6: com colisão, `RefIndex` teria de escolher entre dois
    `codigo_ibge` para o mesmo nome dobrado, e escolheria errado metade das vezes.
    """
    dobrados = [fold(n) for n in nomes]
    duplicados = {d for d in dobrados if dobrados.count(d) > 1}
    assert not duplicados, f"nomes dobrados colidindo: {sorted(duplicados)}"
    assert len(set(dobrados)) == 417
