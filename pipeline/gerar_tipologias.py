"""
Le Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx e gera o array TIPOLOGIAS (TS)
pra substituir o placeholder de 2 itens em frontend/src/data/fixtures.ts.

Uso: .venv/bin/python3 pipeline/gerar_tipologias.py > /tmp/tipologias.ts
"""
import re
import unicodedata
import openpyxl

SRC = "data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx"

POTENCIAL = {"A": "grande", "M": "medio", "P": "pequeno"}


def slug_codigo(codigo: str) -> str:
    return "b" + codigo[1:].replace(".", "-")


def num(s: str) -> int:
    return int(s.replace(".", "").replace(",", ""))


def parse_faixas(pequeno, medio, grande, codigo):
    """Parse as 3 colunas de porte em faixas [min, max)."""
    if codigo == "B4.2":
        # Célula PORTE PEQUENO é '#ERROR!' (artefato de fórmula quebrada na
        # planilha fonte) e PORTE MÉDIO é a nota "(faixa não expressa na
        # publicação oficial)" — a divisão pequeno/médio não existe na fonte.
        # Só a fronteira do porte grande é publicada.
        g = num(re.search(r"[\d.]+", grande).group())
        return [
            {"faixa": "medio", "min": 0, "max": g},
            {"faixa": "grande", "min": g, "max": None},
        ], True

    p = num(re.search(r"[\d.]+", pequeno).group())
    m_matches = re.findall(r"[\d.]+", medio)
    m_min, m_max = num(m_matches[0]), num(m_matches[1])
    g = num(re.search(r"[\d.]+", grande).group())
    assert p == m_min and m_max == g, (pequeno, medio, grande)
    return [
        {"faixa": "pequeno", "min": 0, "max": p},
        {"faixa": "medio", "min": p, "max": g},
        {"faixa": "grande", "min": g, "max": None},
    ], False


def ts_faixas(faixas):
    linhas = []
    for f in faixas:
        maxv = "null" if f["max"] is None else f["max"]
        linhas.append(f'      {{ faixa: \'{f["faixa"]}\', min: {f["min"]}, max: {maxv} }},')
    return "\n".join(linhas)


def campos_condicionais(atividade):
    campos = ["supressao_vegetacao", "explosivos"]
    if "Recursos Hídricos" in atividade:
        campos.insert(1, "recurso_hidrico")
    return campos


def ts_string(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["Divisão B - Mineração"]

    grupo_atual = None
    entradas = []

    for row in ws.iter_rows(min_row=2, max_row=25, values_only=True):
        codigo = row[0]
        if codigo is None:
            continue
        if codigo.startswith("Grupo"):
            grupo_atual = codigo
            continue
        if re.match(r"^B\d\.\d ", codigo):
            # linha de subgrupo (ex.: "B1.1 Minerais metálicos") sem dados
            continue

        (_, atividade, unidade, pequeno, medio, grande, pp, *_) = row
        faixas, incompleta = parse_faixas(pequeno, medio, grande, codigo)
        entradas.append(
            {
                "id": slug_codigo(codigo),
                "codigo": codigo,
                "atividade": atividade,
                "grupo": grupo_atual,
                "unidade": unidade,
                "faixas": faixas,
                "potencial": POTENCIAL[pp],
                "campos": campos_condicionais(atividade),
                "incompleta": incompleta,
            }
        )

    for e in entradas:
        print("  {")
        print(f"    id: {ts_string(e['id'])},")
        print(f"    codigo: {ts_string(e['codigo'])},")
        print(f"    atividade: {ts_string(e['atividade'])},")
        print(f"    grupo: {ts_string('Divisão B — Mineração · ' + e['grupo'])},")
        print("    parametro_porte: 'produção bruta',")
        print(f"    unidade_porte: {ts_string('t/ano')},")
        print("    faixas: [")
        print(ts_faixas(e["faixas"]))
        print("    ],")
        print(f"    potencial_poluente: {ts_string(e['potencial'])},")
        campos_ts = ", ".join(ts_string(c) for c in e["campos"])
        print(f"    campos_condicionais: [{campos_ts}],")
        dispositivo = f"Anexo IV — Divisão B, {e['codigo']}"
        if e["incompleta"]:
            dispositivo += " (faixa de porte pequeno/médio não expressa na fonte — pendente de confirmação em C.1)"
        print("    fundamento: pendente(")
        print("      'Resolução CEPRAM 4.420/2015',")
        print(f"      {ts_string(dispositivo)},")
        print("    ),")
        print("  },")

    import sys
    print(f"// total: {len(entradas)} tipologias", file=sys.stderr)


if __name__ == "__main__":
    main()
