"""Coleta de leis/atos municipais via API pública do Querido Diário.

Endpoint confirmado em 01/08/2026 (WebFetch direto na API, não documentação):
  GET https://api.queridodiario.ok.org.br/gazettes
      ?territory_ids={codigo_ibge}
      &querystring={termo}
      &excerpt_size=500
      &number_of_excerpts=1
      &size=10
      &published_since=YYYY-MM-DD
      &published_until=YYYY-MM-DD

Resposta: {"total_gazettes": int, "gazettes": [...]}. Cada item tem
territory_id, territory_name, state_code, date, edition, is_extra_edition,
url, txt_url, scraped_at, excerpts.

Cobertura: nem todo município tem diário digitalizado no Querido Diário. Por
isso este script SEMPRE roda um probe (size=1, sem querystring) antes da
coleta de verdade e marca no relatório os municípios sem cobertura — esses
caem em `sem_evidencia`, não travam o pipeline (mesmo tratamento do GAC).

ATENÇÃO — qualidade da busca (testado em 01/08/2026 contra Campo Formoso):
o endpoint faz correspondência por palavra solta, não frase exata, e alguns
termos óbvios geram falso-positivo em massa:
  - "lavra" bate com "lavra-se o presente Termo/Contrato" — verbo notarial
    comum, nada a ver com lavra mineral. Mesmo entre aspas continua pegando
    "lavra-se".
  - "gestao ambiental compartilhada" sem aspas é dominado por menções soltas
    de "gestão"; com aspas (frase exata) cai a ZERO resultados.
  - "atividade minerária" deu 1167 resultados pra 1 município só — maioria
    linha de orçamento genérica ("Manutenção das Ações da Secretaria...").
  - "anm" (sigla) casa com fragmentos tipo "Anmo" (erro de OCR/ementa) — sigla
    curta demais pra ser termo de busca sozinha.
Termos abaixo têm sinal real testado manualmente (primeiro resultado
genuinamente relevante), mas isso NÃO elimina falso-positivo — cada `ato`
sai marcado `confirmado_manualmente: false` e precisa de revisão antes de
virar afirmação na interface (mesma trava de honestidade do resto do projeto).

Escopo: os municípios vêm de data/processed/municipios_habilitados.json,
filtrados por status == "habilitado" (decisão do time: coletar para todos os
habilitados no GAC, não um recorte fixo). Rode collect_gac.py antes.

Uso:
  python scripts/collect_querido_diario.py
  python scripts/collect_querido_diario.py --termos "lavra,mineracao" --desde 2015-01-01
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http import build_session, polite_get  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "querido_diario"
MUNICIPIOS_PATH = ROOT / "data" / "processed" / "municipios_habilitados.json"

API_URL = "https://api.queridodiario.ok.org.br/gazettes"

TERMOS_PADRAO = [
    "licenciamento ambiental",
    "mineracao",
    "extracao mineral",
    "cfem",
]


def carregar_municipios_habilitados(apenas_nomes: list[str] | None = None) -> list[dict]:
    if not MUNICIPIOS_PATH.exists():
        raise SystemExit(f"{MUNICIPIOS_PATH} não existe. Rode `python scripts/collect_gac.py scrape` antes.")
    lista = json.loads(MUNICIPIOS_PATH.read_text(encoding="utf-8"))["municipios"]
    habilitados = [m for m in lista.values() if m["status"] == "habilitado"]
    if apenas_nomes:
        from lib.municipios_ba import _normalize  # reaproveita a mesma normalização de nome

        alvo = {_normalize(n) for n in apenas_nomes}
        habilitados = [m for m in habilitados if _normalize(m["municipio"]) in alvo]
    return habilitados


def checar_cobertura(session, codigo_ibge: str) -> bool:
    resp = polite_get(session, API_URL, params={"territory_ids": codigo_ibge, "size": 1}, delay=0.3)
    resp.raise_for_status()
    return resp.json().get("total_gazettes", 0) > 0


def coletar(session, codigo_ibge: str, termo: str, desde: str | None, ate: str | None) -> dict:
    params = {
        "territory_ids": codigo_ibge,
        "querystring": termo,
        "excerpt_size": 500,
        "number_of_excerpts": 1,
        "size": 10,
    }
    if desde:
        params["published_since"] = desde
    if ate:
        params["published_until"] = ate

    resp = polite_get(session, API_URL, params=params)
    resp.raise_for_status()
    payload = resp.json()
    payload["_meta"] = {
        "codigo_ibge": codigo_ibge,
        "termo": termo,
        "params": params,
        "data_de_coleta": date.today().isoformat(),
        "fonte": API_URL,
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--termos", default=",".join(TERMOS_PADRAO), help="lista separada por vírgula")
    parser.add_argument("--desde", default=None, help="published_since, YYYY-MM-DD")
    parser.add_argument("--ate", default=None, help="published_until, YYYY-MM-DD")
    parser.add_argument(
        "--apenas-municipios",
        default=None,
        help="lista de nomes separada por vírgula, para reprocessar só quem falhou por erro de rede",
    )
    args = parser.parse_args()

    termos = [t.strip() for t in args.termos.split(",") if t.strip()]
    apenas_nomes = (
        [n.strip() for n in args.apenas_municipios.split(",") if n.strip()] if args.apenas_municipios else None
    )
    municipios = carregar_municipios_habilitados(apenas_nomes)
    if not municipios:
        raise SystemExit("nenhum município com status 'habilitado' em municipios_habilitados.json")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    session = build_session()

    sem_cobertura = []
    com_erro = []
    for municipio in municipios:
        codigo = municipio["codigo_ibge"]
        try:
            if not checar_cobertura(session, codigo):
                sem_cobertura.append(municipio["municipio"])
                print(f"[sem cobertura] {municipio['municipio']} ({codigo}) — nenhum diário no QD")
                continue

            for termo in termos:
                payload = coletar(session, codigo, termo, args.desde, args.ate)
                slug_termo = termo.replace(" ", "_")
                destino = RAW_DIR / f"{codigo}_{slug_termo}.json"
                destino.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                total = payload.get("total_gazettes", 0)
                print(f"[{total:>3} resultados] {municipio['municipio']} / \"{termo}\" -> {destino.relative_to(ROOT)}")
        except requests.exceptions.RequestException as exc:
            com_erro.append(municipio["municipio"])
            print(f"[ERRO DE REDE] {municipio['municipio']} ({codigo}) — {exc.__class__.__name__}: {exc}")
            continue

    if sem_cobertura:
        print(
            f"\n{len(sem_cobertura)} município(s) sem cobertura no Querido Diário: "
            f"{', '.join(sem_cobertura)} — tratar como sem_evidencia em build_dataset.py"
        )
    if com_erro:
        print(
            f"\n{len(com_erro)} município(s) falharam por erro de rede (não é sem_evidencia, é retry pendente): "
            f"{', '.join(com_erro)}"
        )


if __name__ == "__main__":
    main()
