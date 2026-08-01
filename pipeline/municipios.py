"""
Recorte da amostra — ESCOPO A / seção 1.1 do backlog.

Os municípios são chaveados por CÓDIGO IBGE, não por nome. Nome é grafia
instável ("Santa Luz" no rascunho do backlog não existe; o nome oficial da
malha IBGE 2025 é "Santaluz", uma palavra só). Código não tem esse problema.

Alterar esta lista é a única coisa necessária para mudar o recorte: o
`prep.py` regenera tudo a partir daqui.
"""

# cd_mun -> (nome oficial IBGE 2025, perfil mineral conhecido, ramo que exercita)
AMOSTRA: dict[str, tuple[str, str, str]] = {
    "2917508": ("Jacobina", "ouro — maior produtor mineral do estado", "a confirmar por C.2"),
    "2917706": ("Jaguarari", "cobre", "a confirmar por C.2"),
    "2920502": ("Maracás", "vanádio", "a confirmar por C.2"),
    "2906006": ("Campo Formoso", "cromo e ferroligas", "a confirmar por C.2"),
    "2925204": ("Pojuca", "cromo e ferroligas", "a confirmar por C.2"),
    "2905206": ("Caetité", "urânio e ferro — GATILHO FEDERAL", "UNIAO (3ª virada da demo)"),
    "2904605": ("Brumado", "magnesita", "a confirmar por C.2"),
    "2915205": ("Itagibá", "níquel", "a confirmar por C.2"),
    "2901353": ("Andorinha", "preenchimento de ramo — perfil a confirmar", "a confirmar por C.2"),
    "2928406": ("Santaluz", "preenchimento de ramo — perfil a confirmar", "a confirmar por C.2"),
}

CODIGOS = list(AMOSTRA.keys())
NOMES = {k: v[0] for k, v in AMOSTRA.items()}
