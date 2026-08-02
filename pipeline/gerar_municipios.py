"""
Lê data/processed/gac_habilitacao.json e gera o array MUNICIPIOS (TS) pra
substituir o placeholder de 2 itens em frontend/src/data/fixtures.ts.

`tipologias_delegadas` sai sempre `[]`: o GAC (gestor.meioambiente.ba.gov.br)
publica se o município está habilitado e em que nível de gestão (Art. 7º da
Resolução CEPRAM 4.327/2013), não quais tipologias da Divisão B ele delegou.
Essa segunda informação existe em data/processed/cepram_divisao_b_mineracao.json
(colunas nivel_1/nivel_2/nivel_3 por tipologia+classe), mas cruzá-la com o
nível do município é trabalho de regra (C.4), não de cadastro (C.2) — e as
duas resoluções citadas (4.327/2013 aqui, 4.420/2015 em `TIPOLOGIAS`) não
foram confirmadas como cobrindo a mesma matriz de classificação. Fabricar a
delegação aqui seria repetir o erro que este projeto existe para evitar.

Uso: .venv/bin/python3 pipeline/gerar_municipios.py > /tmp/municipios.ts
"""
import json

SRC = "data/processed/gac_habilitacao.json"


def data_iso(data_br: str | None) -> str | None:
    """'24/09/2014' -> '2014-09-24'. `None` passa direto."""
    if not data_br:
        return None
    dia, mes, ano = data_br.split("/")
    return f"{ano}-{mes}-{dia}"


def ts_str(s: str | None) -> str:
    if s is None:
        return "null"
    return json.dumps(s, ensure_ascii=False)


def ts_municipio(m: dict) -> str:
    fonte = f"Sistema GAC (SEMA-BA) — consórcio {m['consorcio_nome']}"
    return f"""  {{
    cd_mun: {ts_str(m['codigo_ibge'])},
    nm_mun: {ts_str(m['municipio'])},
    status: {ts_str(m['status'])} as StatusHabilitacao,
    nivel: {ts_str(m['nivel'])},
    tipologias_delegadas: [],
    ato: null,
    vigencia_desde: {ts_str(data_iso(m['data_publicacao']))},
    procedencia: {{
      fonte: {ts_str(fonte)},
      url: {ts_str(m['fonte_url'])},
      data_consulta: {ts_str(m['data_consulta'])},
    }},
    observacao: {ts_str(f"situação GAC: {m['situacao_gac']}. tipologias_delegadas pendente de C.4 (ver nota do gerador).")},
  }},"""


def main() -> None:
    dados = json.load(open(SRC, encoding="utf-8"))
    municipios = sorted(dados["municipios"].values(), key=lambda m: m["municipio"])

    print("/**")
    print(f" * ESCOPO C.2 — habilitação municipal para gestão ambiental compartilhada.")
    print(f" *")
    print(f" * {len(municipios)} municípios, gerado por `pipeline/gerar_municipios.py` a partir de")
    print(f" * `data/processed/gac_habilitacao.json` (coletado do Sistema GAC da SEMA-BA em")
    print(f" * {dados['gerado_em']}). Substitui o placeholder de 2 municípios de 0.3.")
    print(f" *")
    print(f" * `tipologias_delegadas` é `[]` em todos — ver nota no gerador sobre por que essa")
    print(f" * informação não está aqui ainda.")
    print(f" */")
    print()
    print("import type { MunicipioHabilitacao, StatusHabilitacao } from '@/lib/schemas'")
    print()
    print(f"export const MUNICIPIOS: MunicipioHabilitacao[] = [")
    for m in municipios:
        print(ts_municipio(m))
    print("]")


if __name__ == "__main__":
    main()
