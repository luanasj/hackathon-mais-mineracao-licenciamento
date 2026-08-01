"""Código compartilhado entre `scripts/` (coleta) e `research_pipeline/` (produto).

Existe para que o produto de longa vida não importe de `scripts/`, que não é pacote e usa
hack de `sys.path` (ver `scripts/collect_gac.py:60`). `scripts/lib/municipios_ba.py` **não é
tocado** (decisão C): o que já funciona fica intacto, e um teste de paridade impede deriva.
"""
