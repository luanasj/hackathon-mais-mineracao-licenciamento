#!/usr/bin/env python3
"""
Relevo — baixa tiles terrain-rgb (encoding `terrarium`) do dataset público
"Terrain Tiles" (s3://elevation-tiles-prod, AWS Open Data, CC0 — mistura
SRTM/GMTED) e grava em `app/public/data/terrain/{z}/{x}/{y}.png`.

    python pipeline/relevo.py

Único passo do pipeline que sai à rede: `prep.py` trabalha só com os brutos
versionados em `data_source/`. Aqui não há bruto equivalente versionável — um
DEM global não cabe no repo — então os tiles baixados são o próprio artefato,
committed como os demais dados de `app/public/data/`. Idempotente: tile já
presente no disco não é baixado de novo.

Depois de baixados, o app consome só os arquivos locais — nenhuma chamada de
rede em tempo de execução (mesmo DoD de `MapaDesenho`/`MapaVisualizacao`).

Zoom 4-9 cobre o bbox dos 10 municípios da amostra com ~140 tiles. Acima de
z9 o maplibre faz overzoom (reamostra o tile mais próximo) — suficiente para
uma camada de sombreamento de contexto, não para análise de elevação.
"""

from __future__ import annotations

import math
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "app" / "public" / "data" / "terrain"
BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"

# bbox dos 10 municípios da amostra (extraído de app/public/data/municipios10.geojson)
MINX, MINY, MAXX, MAXY = -45.008441, -14.5092, -38.137166, -9.740468
ZOOM_MIN, ZOOM_MAX = 4, 9


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int(
        (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi)
        / 2.0
        * n
    )
    return x, y


def main() -> None:
    baixados = ja_existiam = falhas = 0

    for z in range(ZOOM_MIN, ZOOM_MAX + 1):
        x0, y0 = tile_xy(MINX, MAXY, z)  # canto NO (lat máx, lon mín)
        x1, y1 = tile_xy(MAXX, MINY, z)  # canto SE (lat mín, lon máx)

        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                destino = SAIDA / str(z) / str(x) / f"{y}.png"
                if destino.exists():
                    ja_existiam += 1
                    continue
                destino.parent.mkdir(parents=True, exist_ok=True)
                try:
                    with urllib.request.urlopen(
                        f"{BASE_URL}/{z}/{x}/{y}.png", timeout=15
                    ) as r:
                        destino.write_bytes(r.read())
                    baixados += 1
                except Exception as e:
                    falhas += 1
                    print(f"  falha {z}/{x}/{y}: {e}", flush=True)

        print(f"z{z}: x {x0}-{x1} · y {y0}-{y1} ok", flush=True)

    total_kb = sum(p.stat().st_size for p in SAIDA.rglob("*.png")) / 1024
    print(f"\n{baixados} baixados, {ja_existiam} já presentes, {falhas} falhas")
    print(f"{total_kb:.0f} KB em {SAIDA.relative_to(RAIZ)}/")


if __name__ == "__main__":
    main()
