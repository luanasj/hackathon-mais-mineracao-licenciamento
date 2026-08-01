"""Gera documentation/seed.sql (INSERT INTO) a partir dos JSON de data/processed/.

Lê:
  data/processed/cepram_divisao_b_mineracao.json
  data/processed/consorcios.json
  data/processed/municipios_habilitados.json
  data/processed/leis_por_municipio.json

Escreve:
  documentation/seed.sql — popula o schema de documentation/schema.sql
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "processed"
OUT = ROOT / "documentation" / "seed.sql"


def sql_str(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_num(value):
    return "NULL" if value is None else str(value)


def sql_bool(value):
    return "1" if value else "0"


def parse_numeros(texto):
    if not texto:
        return []
    return [int(m.replace(".", "")) for m in re.findall(r"[\d.]+", texto)]


def parse_porte(porte):
    pequeno_raw = porte.get("pequeno")
    medio_raw = porte.get("medio")
    grande_raw = porte.get("grande")

    pequeno_max = parse_numeros(pequeno_raw)
    pequeno_max = pequeno_max[0] if pequeno_max else None

    medio_nums = parse_numeros(medio_raw)
    medio_min = medio_nums[0] if len(medio_nums) >= 1 else None
    medio_max = medio_nums[1] if len(medio_nums) >= 2 else None

    grande_min = parse_numeros(grande_raw)
    grande_min = grande_min[0] if grande_min else None

    return {
        "pequeno_raw": pequeno_raw, "pequeno_max": pequeno_max,
        "medio_raw": medio_raw, "medio_min": medio_min, "medio_max": medio_max,
        "grande_raw": grande_raw, "grande_min": grande_min,
    }


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def gen_cepram(out):
    d = load("cepram_divisao_b_mineracao.json")
    f = d["fundamento"]
    out.append(
        "INSERT INTO fonte_cepram (id, resolucao, publicacao, arquivo_fonte, secao, "
        "paginas_fonte, data_extracao, metodo, verificado) VALUES "
        f"(1, {sql_str(f['resolucao'])}, {sql_str(f['publicacao'])}, {sql_str(f['arquivo_fonte'])}, "
        f"{sql_str(f['secao'])}, {sql_str(f.get('paginas_fonte'))}, {sql_str(f['data_extracao'])}, "
        f"{sql_str(f.get('metodo'))}, {sql_bool(f['verificado'])});"
    )

    for grupo in d["grupos"]:
        out.append(
            "INSERT INTO tipologia_grupo (codigo, divisao, nome, status, nota, fonte_id) VALUES "
            f"({sql_str(grupo['grupo'])}, {sql_str(d['divisao'])}, {sql_str(grupo['nome'])}, "
            f"{sql_str(grupo['status'])}, {sql_str(grupo.get('nota'))}, 1);"
        )
        for tip in grupo.get("tipologias", []):
            porte = parse_porte(tip["porte"])
            out.append(
                "INSERT INTO tipologia (codigo, grupo_codigo, nome, unidade_medida_porte, "
                "potencial_poluidor, porte_pequeno_raw, porte_pequeno_limite_superior, "
                "porte_medio_raw, porte_medio_limite_inferior, porte_medio_limite_superior, "
                "porte_grande_raw, porte_grande_limite_inferior, pagina_fonte, nota, fonte_id) VALUES "
                f"({sql_str(tip['codigo'])}, {sql_str(grupo['grupo'])}, {sql_str(tip['tipologia'])}, "
                f"{sql_str(tip['unidade_medida_porte'])}, {sql_str(tip['potencial_poluidor'])}, "
                f"{sql_str(porte['pequeno_raw'])}, {sql_num(porte['pequeno_max'])}, "
                f"{sql_str(porte['medio_raw'])}, {sql_num(porte['medio_min'])}, {sql_num(porte['medio_max'])}, "
                f"{sql_str(porte['grande_raw'])}, {sql_num(porte['grande_min'])}, "
                f"{sql_str(str(tip.get('pagina_fonte')))}, {sql_str(tip.get('nota'))}, 1);"
            )
            for i, nivel_key in enumerate(("nivel_1", "nivel_2", "nivel_3"), start=1):
                classes = tip["nivel_gestao_municipal"].get(nivel_key)
                out.append(
                    "INSERT INTO tipologia_nivel_gestao (tipologia_codigo, nivel, classes_autorizadas) VALUES "
                    f"({sql_str(tip['codigo'])}, {i}, {sql_str(classes)});"
                )

    matriz = d["classificacao_impacto_art_3"]
    fundamento = matriz["fundamento"]
    porte_map = {"porte_pequeno": "pequeno", "porte_medio": "medio", "porte_grande": "grande"}
    poluidor_map = {"poluidor_pequeno": "pequeno", "poluidor_medio": "medio", "poluidor_alto": "alto"}
    for porte_key, linha in matriz["matriz"].items():
        for poluidor_key, classe in linha.items():
            out.append(
                "INSERT INTO classe_impacto (porte, potencial_poluidor, classe, fundamento) VALUES "
                f"({sql_str(porte_map[porte_key])}, {sql_str(poluidor_map[poluidor_key])}, "
                f"{sql_str(classe)}, {sql_str(fundamento)});"
            )


def gen_consorcios(out):
    d = load("consorcios.json")
    for cid, c in d["consorcios"].items():
        out.append(
            "INSERT INTO consorcio (consorcio_id, nome) VALUES "
            f"({sql_str(cid)}, {sql_str(c['nome'])});"
        )


def gen_municipios_habilitacao(out):
    d = load("municipios_habilitados.json")
    for codigo, m in d["municipios"].items():
        out.append(
            "INSERT INTO municipio (codigo_ibge, nome) VALUES "
            f"({sql_str(codigo)}, {sql_str(m['municipio'])});"
        )
    for codigo, m in d["municipios"].items():
        out.append(
            "INSERT INTO habilitacao_gac (codigo_ibge, consorcio_id, nivel, status, situacao_gac, "
            "data_publicacao, fonte_url, data_consulta) VALUES "
            f"({sql_str(codigo)}, {sql_str(m.get('consorcio_id'))}, {sql_str(m.get('nivel'))}, "
            f"{sql_str(m['status'])}, {sql_str(m['situacao_gac'])}, {sql_str(m.get('data_publicacao'))}, "
            f"{sql_str(m['fonte_url'])}, {sql_str(m['data_consulta'])});"
        )


def gen_leis(out):
    d = load("leis_por_municipio.json")
    for codigo, m in d["municipios"].items():
        for termo in m.get("termos_pesquisados", []):
            out.append(
                "INSERT INTO municipio_termo_busca (codigo_ibge, termo) VALUES "
                f"({sql_str(codigo)}, {sql_str(termo)});"
            )
        for ato in m.get("atos", []):
            out.append(
                "INSERT INTO ato_diario_oficial (codigo_ibge, termo, url, txt_url, data_ato, edicao, "
                "excerto, data_coleta, fonte, confirmado_manualmente) VALUES "
                f"({sql_str(codigo)}, {sql_str(ato['termo_encontrado'])}, {sql_str(ato['url'])}, "
                f"{sql_str(ato.get('txt_url'))}, {sql_str(ato.get('data'))}, {sql_str(ato.get('edicao'))}, "
                f"{sql_str(ato['excerto'])}, {sql_str(ato['data_de_coleta'])}, {sql_str(ato['fonte'])}, "
                f"{sql_bool(ato.get('confirmado_manualmente', False))});"
            )


def main():
    out = ["-- Gerado por scripts/generate_seed_sql.py a partir de data/processed/. Não editar à mão.",
           "-- Uma única transação: ordem dos INSERT já respeita as FKs (municipio antes de",
           "-- habilitacao_gac/ato_diario_oficial, termo_busca vem do schema.sql).",
           "BEGIN TRANSACTION;", ""]
    gen_cepram(out)
    gen_consorcios(out)
    gen_municipios_habilitacao(out)
    gen_leis(out)
    out.append("COMMIT;")
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{len(out)} linhas escritas em {OUT}")


if __name__ == "__main__":
    main()
