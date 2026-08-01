"""Gera os stubs de contato por município para preenchimento manual.

Não existe API nem padrão de HTML entre portais de prefeitura — não dá para
escrever um scraper genérico (mesmo diagnóstico já registrado no README/chat
do time). Este script só gera o esqueleto JSON por município, um por arquivo,
para alguém preencher à mão com a mesma disciplina do dossiê GAC: fonte e
data de consulta em cada campo preenchido.

Nunca sobrescreve um arquivo que já tenha sido preenchido manualmente.

Uso:
  python scripts/collect_contatos.py
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "contatos"
MUNICIPIOS_PATH = ROOT / "data" / "processed" / "municipios_habilitados.json"

STUB_CAMPOS = {
    "orgao_ambiental_municipal": None,
    "telefone": None,
    "email": None,
    "site": None,
    "endereco": None,
    "fonte_url": None,
    "data_consulta": None,
    "status": "pendente_preenchimento_manual",
}


def carregar_municipios_habilitados() -> list[dict]:
    if not MUNICIPIOS_PATH.exists():
        raise SystemExit(f"{MUNICIPIOS_PATH} não existe. Rode collect_gac.py primeiro.")
    lista = json.loads(MUNICIPIOS_PATH.read_text(encoding="utf-8"))["municipios"]
    return [m for m in lista.values() if m["status"] == "habilitado"]


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    municipios = carregar_municipios_habilitados()

    criados, existentes = 0, 0
    for municipio in municipios:
        destino = RAW_DIR / f"{municipio['codigo_ibge']}.json"
        if destino.exists():
            existentes += 1
            continue
        stub = {
            "codigo_ibge": municipio["codigo_ibge"],
            "municipio": municipio["municipio"],
            **STUB_CAMPOS,
            "gerado_em": date.today().isoformat(),
        }
        destino.write_text(json.dumps(stub, ensure_ascii=False, indent=2), encoding="utf-8")
        criados += 1
        print(f"stub criado: {destino.relative_to(ROOT)}")

    print(f"\n{criados} stub(s) novo(s), {existentes} já existiam e foram preservados.")
    print("Preencha manualmente cada arquivo em data/raw/contatos/ antes de rodar build_dataset.py.")


if __name__ == "__main__":
    main()
