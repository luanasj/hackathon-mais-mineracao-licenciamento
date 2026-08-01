"""Consolida data/raw/** em data/processed/*.json — os arquivos que a aplicação consome.

Este é o único script que a app "vê": nada aqui chama rede, tudo lê o que os
coletores já baixaram. Roda quantas vezes for preciso, é idempotente.

Regra de honestidade (Definition of Done do BACKLOG.md): todo registro final
carrega fonte + data_consulta, ou é descartado com aviso — nunca entra mudo.

Uso:
  python scripts/build_dataset.py
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

MUNICIPIOS_PATH = PROCESSED / "municipios_habilitados.json"


def build_gac_habilitacao() -> None:
    """municipios_habilitados.json já É o formato final — só valida e copia com o nome do skeleton."""
    if not MUNICIPIOS_PATH.exists():
        print("[gac] municipios_habilitados.json ainda não existe — rode collect_gac.py")
        return

    lista = json.loads(MUNICIPIOS_PATH.read_text(encoding="utf-8"))["municipios"]
    faltando_fonte = [m["municipio"] for m in lista.values() if not m.get("fonte_url")]
    if faltando_fonte:
        print(f"[gac] AVISO: sem fonte_url: {', '.join(faltando_fonte)} — não deveriam existir")

    destino = PROCESSED / "gac_habilitacao.json"
    destino.write_text(
        json.dumps({"gerado_em": date.today().isoformat(), "municipios": lista}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[gac] {len(lista)} município(s) -> {destino.relative_to(ROOT)}")


def build_leis_por_municipio() -> None:
    qd_dir = RAW / "querido_diario"
    if not qd_dir.exists():
        print("[querido_diario] nada em data/raw/querido_diario — rode collect_querido_diario.py")
        return

    por_municipio: dict[str, dict] = {}
    for arquivo in sorted(qd_dir.glob("*.json")):
        payload = json.loads(arquivo.read_text(encoding="utf-8"))
        meta = payload.get("_meta", {})
        codigo = meta.get("codigo_ibge")
        if not codigo:
            print(f"[querido_diario] AVISO: {arquivo.name} sem _meta.codigo_ibge, ignorado")
            continue

        entrada = por_municipio.setdefault(
            codigo,
            {"codigo_ibge": codigo, "atos": [], "termos_pesquisados": []},
        )
        entrada["termos_pesquisados"].append(meta.get("termo"))

        vistos = {a["url"] for a in entrada["atos"]}
        for gazette in payload.get("gazettes", []):
            if gazette["url"] in vistos:
                continue
            entrada["atos"].append(
                {
                    "url": gazette["url"],
                    "txt_url": gazette.get("txt_url"),
                    "data": gazette.get("date"),
                    "edicao": gazette.get("edition"),
                    "excerto": (gazette.get("excerpts") or [None])[0],
                    "termo_encontrado": meta.get("termo"),
                    "data_de_coleta": meta.get("data_de_coleta"),
                    "fonte": meta.get("fonte"),
                }
            )
            vistos.add(gazette["url"])

    destino = PROCESSED / "leis_por_municipio.json"
    destino.write_text(
        json.dumps(
            {"gerado_em": date.today().isoformat(), "municipios": por_municipio},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    total_atos = sum(len(v["atos"]) for v in por_municipio.values())
    print(f"[querido_diario] {len(por_municipio)} município(s), {total_atos} ato(s) -> {destino.relative_to(ROOT)}")


def build_contatos_por_municipio() -> None:
    contatos_dir = RAW / "contatos"
    if not contatos_dir.exists():
        print("[contatos] nada em data/raw/contatos — rode collect_contatos.py")
        return

    contatos = {}
    pendentes = []
    for arquivo in sorted(contatos_dir.glob("*.json")):
        stub = json.loads(arquivo.read_text(encoding="utf-8"))
        contatos[stub["codigo_ibge"]] = stub
        if stub.get("status") == "pendente_preenchimento_manual":
            pendentes.append(stub["municipio"])

    destino = PROCESSED / "contatos_por_municipio.json"
    destino.write_text(
        json.dumps(
            {"gerado_em": date.today().isoformat(), "municipios": contatos},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[contatos] {len(contatos)} município(s) -> {destino.relative_to(ROOT)}")
    if pendentes:
        print(f"[contatos] AVISO: ainda pendentes de preenchimento manual: {', '.join(pendentes)}")


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    build_gac_habilitacao()
    build_leis_por_municipio()
    build_contatos_por_municipio()


if __name__ == "__main__":
    main()
