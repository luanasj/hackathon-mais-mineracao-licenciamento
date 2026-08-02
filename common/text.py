"""Dobra de texto para casamento de nomes — a chave que amarra grafias divergentes.

Origem: `scripts/lib/municipios_ba.py:55` (`_normalize`). Aqui é cópia com **duas
divergências intencionais**, ambas exigidas pelo §7.2 do `research_pipeline/GOAL.md` e
travadas por `common/tests/test_text_parity.py`:

1. **Apóstrofo é removido, não vira espaço.** `Dias d'Ávila` → `dias davila`
   (`_normalize` devolve `dias d avila`). O apóstrofo marca elisão *dentro* de uma
   palavra, então colá-la é a leitura certa.
2. **Traço vira espaço.** `Xique-Xique` → `xique xique` (`_normalize` mantém o hífen).
   O hífen une duas palavras, então separá-las é a leitura certa.

`TRACOS` inclui `\\x96` porque o consórcio `45429` o traz literalmente:
`'CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \\x96 CISUDOESTE'` — en-dash mojibake de
cp1252, gravado assim na fonte. `'\\x96'.isspace()` é `False` e o NFKD não o toca, então sem
esta linha ele sobreviveria à dobra e entraria como token no `token_set_ratio` do matcher.

⚠️ **Sigla de consórcio sai do nome cru, nunca do dobrado.** A regra do §7.2 exige que o
segmento após o separador seja um único token em caixa alta, e a dobra destrói a caixa. Ou
seja: extrair sigla **antes** de dobrar, sempre.

Fatos medidos e fixados pelos testes: entre os 417 municípios a dobra não colide com nada
(logo serve de chave única, como o §7.2 afirma), entre os 29 consórcios também não, e `fold`
é idempotente.
"""

from __future__ import annotations

import unicodedata

APOSTROFOS = ("'", "‘", "’", "`")
"""Removidos (viram string vazia): reto, curvo esquerdo, curvo direito, acento grave."""

TRACOS = ("-", "–", "—", "\x96", "\x97")
"""Viram espaço: hífen, en-dash, em-dash e os dois mojibakes cp1252 correspondentes."""


def fold(texto: str) -> str:
    """Dobra `texto` para a forma canônica de comparação.

    NFKD → descarta combinantes (acentos) → remove apóstrofos → traços viram espaço →
    minúsculo → colapsa espaços.

    >>> fold("Dias d'Ávila")
    'dias davila'
    >>> fold("Xique-Xique")
    'xique xique'
    >>> fold("CONSORCIO") == fold("Consórcio")
    True
    """
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    for apostrofo in APOSTROFOS:
        texto = texto.replace(apostrofo, "")
    for traco in TRACOS:
        texto = texto.replace(traco, " ")
    return " ".join(texto.lower().split())
