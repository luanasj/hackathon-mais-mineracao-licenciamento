import sys

# Console do Windows (cp1252) derruba print() com nomes de município acentuados
# (ex: "Sertão" -> UnicodeEncodeError). Só afeta a exibição no terminal; os
# arquivos em disco já são gravados como UTF-8 explicitamente em cada script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
