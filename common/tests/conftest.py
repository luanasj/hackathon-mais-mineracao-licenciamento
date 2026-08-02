"""Fixtures compartilhadas pelos testes de paridade de `common/`.

`common/text.py` e `common/dbf.py` são cópias deliberadas de `scripts/lib/municipios_ba.py`
(decisão C: o código de coleta que já funciona não é tocado). Os dois testes de paridade
precisam do original carregado, e é isso que o fixture abaixo faz.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MUNICIPIOS_BA_PATH = REPO_ROOT / "scripts" / "lib" / "municipios_ba.py"
DBF_SIGMINE = REPO_ROOT / "data_source" / "BA-shapefile" / "BA.dbf"
DBF_IBGE = REPO_ROOT / "data_source" / "Malha municipal IBGE-BA" / "BA_Municipios_2025.dbf"


@pytest.fixture(scope="session")
def municipios_ba():
    """Carrega `scripts/lib/municipios_ba.py` pelo caminho, não por import.

    `scripts/` não tem `__init__.py` e `scripts/collect_gac.py:60` resolve isso mexendo em
    `sys.path`. Carga direta por `spec_from_file_location` dá o mesmo acesso sem sujar o
    `sys.path` do processo de teste.
    """
    spec = importlib.util.spec_from_file_location("_municipios_ba_paridade", MUNICIPIOS_BA_PATH)
    assert spec is not None and spec.loader is not None, MUNICIPIOS_BA_PATH
    modulo = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = modulo
    try:
        spec.loader.exec_module(modulo)
        yield modulo
    finally:
        del sys.modules[spec.name]
