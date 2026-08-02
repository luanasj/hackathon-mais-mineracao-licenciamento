#!/usr/bin/env python3
"""
Relevo colorido — tinta hipsométrica (cor por altitude) a partir dos tiles
terrain-rgb já baixados por `pipeline/relevo.py`.

    python pipeline/relevo_cor.py

Não sai à rede: decodifica `frontend/public/data/terrain/{z}/{x}/{y}.png`
(encoding `terrarium`: elevação = R*256 + G + B/256 - 32768) e grava tiles RGB
comuns em `frontend/public/data/relevo_cor/{z}/{x}/{y}.png`, na mesma grade de
zoom. O frontend soma isso como uma camada `raster` normal, com o `hillshade`
de `pipeline/relevo.py` por cima para dar textura de sombra.

Rampa de cor alinhada à paleta editorial do app (`CORES` em
`frontend/src/parecer/dados.ts`: verde/terra/terraClara), não ao verde-
amarelo-vermelho padrão de hipsometria de satélite — o objetivo é colorir sem
destoar do resto da tela.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "frontend" / "public" / "data" / "terrain"
SAIDA = RAIZ / "frontend" / "public" / "data" / "relevo_cor"

# (altitude em metros, cor RGB) — vale de município a topo de chapada.
# Fora da faixa, satura na cor da ponta (clip), não extrapola.
RAMPA_M = [0, 250, 450, 750, 1100, 1500, 1900]
RAMPA_COR = [
    (0x3E, 0x4A, 0x30),  # calha de drenagem / vale — verde escuro
    (0x54, 0x63, 0x3E),  # próximo a CORES.verde
    (0x7C, 0x7A, 0x47),  # oliva
    (0xA0, 0x8B, 0x54),  # ocre — próximo a CORES.terraClara
    (0xB9, 0xA3, 0x79),  # tan claro
    (0xE4, 0xDC, 0xC8),  # quase CORES.terraMapa — alta chapada
    (0xF7, 0xF3, 0xE8),  # topo — quase branco
]


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def colorir(elevacao: np.ndarray) -> np.ndarray:
    """Interpola a rampa canal a canal. `elevacao` é 2D; retorna RGB uint8."""
    saida = np.empty((*elevacao.shape, 3), dtype=np.uint8)
    for canal in range(3):
        valores = [cor[canal] for cor in RAMPA_COR]
        saida[..., canal] = np.interp(elevacao, RAMPA_M, valores)
    return saida


def main() -> None:
    if not ENTRADA.exists():
        raise SystemExit(f"{ENTRADA} não existe — rode antes: python pipeline/relevo.py")

    tiles = sorted(ENTRADA.rglob("*.png"))
    if not tiles:
        raise SystemExit(f"nenhum tile em {ENTRADA} — rode antes: python pipeline/relevo.py")

    for origem in tiles:
        z, x = origem.parent.parent.name, origem.parent.name
        y = origem.stem
        destino = SAIDA / z / x / f"{y}.png"
        destino.parent.mkdir(parents=True, exist_ok=True)

        rgb = np.array(Image.open(origem).convert("RGB")).astype(np.float64)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        elevacao = r * 256 + g + b / 256 - 32768
        # fora do bbox real de terra (nodata/borda) vira água/vazio: satura
        # abaixo do primeiro degrau da rampa, não distorce a rampa inteira.
        elevacao = np.clip(elevacao, RAMPA_M[0], RAMPA_M[-1])

        Image.fromarray(colorir(elevacao), mode="RGB").save(destino)

    total_kb = sum(p.stat().st_size for p in SAIDA.rglob("*.png")) / 1024
    log(f"{len(tiles)} tiles coloridos · {total_kb:.0f} KB em {SAIDA.relative_to(RAIZ)}/")


if __name__ == "__main__":
    main()
