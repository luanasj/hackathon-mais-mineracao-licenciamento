"""Leitura dos 417 municípios da Bahia direto do shapefile do IBGE.

Usa um parser DBF escrito à mão em vez de geopandas/GDAL: o ambiente de
desenvolvimento não tem acesso de rede para instalar geopandas/pyogrio, e o
arquivo .dbf é um formato binário simples o bastante para não precisar da
dependência pesada só para ler 15 colunas de atributo.

Fonte: data_source/Malha municipal IBGE-BA/BA_Municipios_2025.dbf (IBGE, 2025).
"""

from __future__ import annotations

import struct
import unicodedata
from pathlib import Path

DBF_PATH = (
    Path(__file__).resolve().parents[2]
    / "data_source"
    / "Malha municipal IBGE-BA"
    / "BA_Municipios_2025.dbf"
)


def _read_dbf(path: Path, encoding: str = "utf-8") -> list[dict]:
    """encoding vem do .cpg ao lado do .dbf — para este arquivo (IBGE 2025) é UTF-8,
    não latin1 (o padrão antigo de shapefile). Decodificar com o encoding errado não
    dá erro, só corrompe silenciosamente os nomes acentuados — já aconteceu aqui."""
    data = path.read_bytes()
    n_records = struct.unpack("<I", data[4:8])[0]
    header_size = struct.unpack("<H", data[8:10])[0]
    record_size = struct.unpack("<H", data[10:12])[0]

    fields = []
    pos = 32
    while data[pos] != 0x0D:
        name = data[pos : pos + 11].split(b"\x00")[0].decode("ascii")
        length = data[pos + 16]
        fields.append((name, length))
        pos += 32

    records = []
    for i in range(n_records):
        start = header_size + i * record_size
        rec = data[start : start + record_size]
        offset = 1  # primeiro byte é a flag de deleção
        row = {}
        for name, length in fields:
            row[name] = rec[offset : offset + length].decode(encoding).strip()
            offset += length
        records.append(row)
    return records


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    for apostrofo in ("'", "‘", "’", "`"):
        text = text.replace(apostrofo, " ")
    return " ".join(text.lower().split())


# Nomes que divergem entre fontes oficiais (não é erro de normalização, é
# grafia diferente de fato) — mapeamento normalizado -> nome IBGE.
# Ex.: GAC (gestor.meioambiente.ba.gov.br) registra "SANTA TERESINHA";
# o IBGE (malha 2025) registra "Santa Terezinha" (codigo_ibge 2928505).
ALIASES = {
    "santa teresinha": "santa terezinha",
}

_cache: list[dict] | None = None


def load_municipios() -> list[dict]:
    """Retorna os 417 municípios da Bahia: codigo_ibge, municipio, regiao_imediata."""
    global _cache
    if _cache is None:
        rows = _read_dbf(DBF_PATH)
        _cache = [
            {
                "codigo_ibge": r["CD_MUN"],
                "municipio": r["NM_MUN"],
                "regiao_imediata": r["NM_RGI"],
                "area_km2": r["AREA_KM2"],
            }
            for r in rows
        ]
    return _cache


def by_codigo(codigo_ibge: str) -> dict | None:
    codigo_ibge = str(codigo_ibge).strip()
    for m in load_municipios():
        if m["codigo_ibge"] == codigo_ibge:
            return m
    return None


def by_nome(nome: str) -> dict | None:
    """Busca por nome, tolerante a acento/caixa/apóstrofo, e a um punhado de
    grafias divergentes conhecidas (ALIASES). Levanta erro se ambíguo."""
    alvo = _normalize(nome)
    alvo = ALIASES.get(alvo, alvo)
    candidatos = [m for m in load_municipios() if _normalize(m["municipio"]) == alvo]
    if len(candidatos) > 1:
        raise ValueError(f"nome ambíguo, {len(candidatos)} municípios batem com {nome!r}")
    return candidatos[0] if candidatos else None


if __name__ == "__main__":
    todos = load_municipios()
    print(f"{len(todos)} municípios carregados de {DBF_PATH.name}")
    print(todos[0])
