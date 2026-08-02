"""Exceções compartilhadas pelos carregadores.

Módulo separado por um motivo mecânico: `refs.py` importa `vocab.py` para preencher
`ReferenceData.tipologias`, e os dois precisam da mesma exceção. Deixá-la em `refs.py`
criaria um ciclo de import; deixá-la duplicada faria `except RefLoadError` pegar uma
das duas conforme o caminho do import, que é pior que o ciclo.

`refs.py` reexporta `RefLoadError` para que `from research_pipeline.refs import RefLoadError`
continue valendo — é o objeto, não uma cópia.
"""

from __future__ import annotations


class RefLoadError(Exception):
    """Referência canônica ou vocabulário inválido. Sempre nomeia arquivo e registro."""
