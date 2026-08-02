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
    # ⚠️ 2928406 é Santa Rita de Cássia na malha IBGE 2025, NÃO Santaluz
    # (Santaluz é 2928000). A constante dizia "Santaluz" e `prep.py` sobrescreve
    # o nome oficial da malha pelo daqui, então `municipios10.geojson` saía com
    # o nome errado sob o código certo — enquanto `municipios_habilitados.json`
    # e as licenças do research_pipeline usam o nome certo para o mesmo código.
    # Como o join de habilitação é POR NOME (`frontend/src/lib/fatos.ts:95`), a
    # divergência virava `sem_evidencia` silencioso.
    #
    # Corrigido o NOME, não o código: trocar o código mudaria `CODIGOS`, que
    # filtra quais processos entram em `processos.geojson` (prep.py:236), e
    # Santa Rita de Cássia é o município onde estão todos os 34 processos que
    # cruzam a divisa BA/PI — a base do sinal de "dois estados". Se a intenção
    # do recorte era mesmo Santaluz, a troca é para "2928000" e exige rodar
    # `prep.py` de novo; é decisão de produto, não de correção de bug.
    "2928406": (
        "Santa Rita de Cássia",
        "divisa BA/PI — 34 poligonais que saem do estado",
        "a confirmar por C.2",
    ),
}

CODIGOS = list(AMOSTRA.keys())
NOMES = {k: v[0] for k, v in AMOSTRA.items()}
