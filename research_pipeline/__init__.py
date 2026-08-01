"""Pipeline LangGraph que produz a base de licenças de mineração — escopo em GOAL.md.

Este `__init__.py` existe por dois motivos concretos, nenhum deles cerimonial:

1. sem ele o diretório resolve como *namespace package* e `python -m research_pipeline.run`
   (§9) não acha o módulo;
2. com ele — mais o de `tests/` — o pytest no `importmode=prepend` sobe até a raiz do repo
   ao coletar `research_pipeline/tests/`, e é a raiz que entra no `sys.path`. É o que faz
   `import common.text` funcionar nos testes sem nenhum hack de `sys.path`.
"""

from pathlib import Path

# Raiz do repo. Os carregadores (refs.py, vocab.py) resolvem data/processed/ e
# data_source/ a partir daqui, nunca do diretório de trabalho.
REPO_ROOT = Path(__file__).resolve().parents[1]

# Aqui e não em refs.py: `vocab.py` também precisa dele no `__main__`, e importá-lo de
# `refs.py` fecharia o ciclo que `errors.py` existe para evitar.
MAPPING_PATH = Path(__file__).resolve().parent / "config" / "ref_mapping.yaml"
