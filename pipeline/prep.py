#!/usr/bin/env python3
"""
ESCOPO 0.4 — pipeline de pré-processamento geoespacial.

    python pipeline/prep.py

Regenera, a partir exclusivamente dos brutos versionados em `data_source/`,
todos os artefatos que a aplicação consome em `app/public/data/`. Idempotente:
rodar duas vezes produz byte a byte o mesmo resultado.

Cobre as tasks:
    A.2  recorte da malha municipal IBGE-BA aos municípios da amostra
    A.3  spatial join SIGMINE × malha, com proporção de área por município
    A.4  filtro, simplificação topológica e exportação dos processos
    A.5  índice de busca `processo → feature`, com entrada normalizada
    A.7  listagem dos processos cuja poligonal cruza divisa municipal

Decisões técnicas registradas aqui porque o README as cita:

  · Área em EPSG projetado equivalente (Albers cônica de área igual para o
    Brasil, parâmetros IBGE). Calcular área em graus decimais dá número errado
    e proporção errada — e a proporção é o que decide a 4ª virada da demo.

  · O cruzamento de divisa é apurado contra as 417 feições da malha, não
    contra as 10 da amostra. Uma poligonal que sai de Jacobina para um
    município fora do recorte cruza divisa do mesmo jeito, e é justamente o
    caso que leva a INDETERMINADO.

  · Fatias abaixo de LIMIAR_SLIVER são descartadas. Sobreposição de bordas
    entre dois shapefiles de origens diferentes produz lascas de alguns metros
    quadrados que não são incidência real; sem esse corte, quase todo processo
    de borda apareceria falsamente como cruzando divisa.

  · Simplificação por mapshaper (Visvalingam, `keep-shapes`), que preserva
    topologia entre feições vizinhas. `shapely.simplify` opera feição a feição
    e abre vãos entre polígonos adjacentes.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import force_2d, make_valid

sys.path.insert(0, str(Path(__file__).parent))
from municipios import AMOSTRA, CODIGOS  # noqa: E402

# ---------------------------------------------------------------------------
# Caminhos e parâmetros
# ---------------------------------------------------------------------------

RAIZ = Path(__file__).resolve().parent.parent
BRUTOS = RAIZ / "data_source"
SIGMINE_SHP = BRUTOS / "BA-shapefile" / "BA.shp"
MALHA_SHP = BRUTOS / "Malha municipal IBGE-BA" / "BA_Municipios_2025.shp"
SAIDA = RAIZ / "app" / "public" / "data"

# SIRGAS 2000 / Albers cônica equivalente para o Brasil (parâmetros IBGE).
# Não há código EPSG oficial para esta projeção; a string PROJ é o contrato.
CRS_AREA = (
    "+proj=aea +lat_1=-2 +lat_2=-22 +lat_0=-12 +lon_0=-54 "
    "+x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
)

# Fatia mínima para contar como incidência real, e não como lasca de borda.
LIMIAR_SLIVER_PROPORCAO = 0.005  # 0,5% da área da poligonal
LIMIAR_SLIVER_HA = 0.5  # ou meio hectare em termos absolutos

TETO_PROCESSOS_MB = 4.0
TETO_MUNICIPIOS_KB = 300.0

# Tolerâncias tentadas em ordem, até o arquivo caber no teto.
ESCADA_SIMPLIFICACAO = ["8%", "5%", "3%", "2%", "1%"]


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def etapa(titulo: str) -> None:
    print(f"\n[{titulo}]", flush=True)


def tamanho(p: Path) -> float:
    """Tamanho em KB."""
    return p.stat().st_size / 1024


# ---------------------------------------------------------------------------
# Normalização de número de processo (A.5)
# ---------------------------------------------------------------------------


def normalizar_processo(bruto: str) -> str:
    """Reduz qualquer grafia a dígitos puros: a chave de busca.

    `870.123/2019`, `870123/2019` e `8701232019` colapsam no mesmo valor.
    """
    return re.sub(r"\D", "", str(bruto or ""))


def formatar_processo(numero: int, ano: int) -> str:
    """Grafia canônica de exibição, no padrão ANM: `870.123/2019`."""
    n = int(numero)
    if n >= 100_000:
        return f"{n // 1000}.{n % 1000:03d}/{int(ano)}"
    return f"{n}/{int(ano)}"


# ---------------------------------------------------------------------------
# Carga e higienização
# ---------------------------------------------------------------------------


def carregar_malha() -> gpd.GeoDataFrame:
    etapa("A.2 — malha municipal IBGE-BA")
    malha = gpd.read_file(MALHA_SHP)
    malha["geometry"] = force_2d(malha.geometry)
    malha = malha[["CD_MUN", "NM_MUN", "AREA_KM2", "geometry"]].copy()
    log(f"{len(malha)} municípios carregados · CRS {malha.crs.to_string()}")

    faltando = set(CODIGOS) - set(malha.CD_MUN)
    if faltando:
        raise SystemExit(
            f"códigos IBGE da amostra ausentes na malha: {sorted(faltando)}"
        )
    return malha


def carregar_sigmine() -> gpd.GeoDataFrame:
    etapa("SIGMINE — carga e higienização")
    sig = gpd.read_file(SIGMINE_SHP)
    bruto = len(sig)
    log(f"{bruto} feições brutas · CRS {sig.crs.to_string()}")

    # O shapefile vem como 'Measured 3D Polygon'; a aplicação é 2D.
    sig["geometry"] = force_2d(sig.geometry)

    invalidas = ~sig.geometry.is_valid
    if invalidas.any():
        log(f"{int(invalidas.sum())} geometrias inválidas → make_valid")
        sig.loc[invalidas, "geometry"] = sig.loc[invalidas, "geometry"].apply(make_valid)

    # make_valid pode devolver GeometryCollection; só interessa área.
    antes = len(sig)
    sig = sig[sig.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    sig = sig[~sig.geometry.is_empty]
    if len(sig) != antes:
        log(f"{antes - len(sig)} feições descartadas (sem área após saneamento)")

    # Um mesmo número de processo aparece em várias feições quando a área
    # outorgada é descontínua. Para o produto a unidade é o processo, não o
    # polígono: sem dissolver, `870.101/2021` resolveria para três registros
    # diferentes na busca — o oposto do critério de aceite de A.5.
    sig["processo_norm"] = sig.PROCESSO.map(normalizar_processo)
    n_partes = len(sig)
    sig = sig.dissolve(
        by="processo_norm",
        as_index=False,
        aggfunc={
            "PROCESSO": "first",
            "NUMERO": "first",
            "ANO": "first",
            "FASE": "first",
            "SUBS": "first",
            "NOME": "first",
            "USO": "first",
            "ULT_EVENTO": "first",
            "AREA_HA": "sum",  # partes disjuntas somam
        },
    )
    if len(sig) != n_partes:
        log(f"{n_partes - len(sig)} feições dissolvidas em processos multiparte")

    sig = sig.reset_index(drop=True)
    sig["fid"] = sig.index
    log(f"{len(sig)} processos distintos")
    return sig


# ---------------------------------------------------------------------------
# A.3 — spatial join com proporção de área
# ---------------------------------------------------------------------------


def incidencia_municipal(
    sig: gpd.GeoDataFrame, malha: gpd.GeoDataFrame
) -> pd.DataFrame:
    etapa("A.3 — spatial join SIGMINE × malha, com proporção de área")

    sig_a = sig[["fid", "geometry"]].to_crs(CRS_AREA)
    malha_a = malha[["CD_MUN", "NM_MUN", "geometry"]].to_crs(CRS_AREA)
    sig_a["area_total_m2"] = sig_a.geometry.area

    log("recortando poligonais contra as 417 feições da malha…")
    inter = gpd.overlay(sig_a, malha_a, how="intersection", keep_geom_type=True)
    inter["area_m2"] = inter.geometry.area

    inc = (
        inter.groupby(["fid", "CD_MUN", "NM_MUN"], as_index=False)["area_m2"]
        .sum()
        .merge(sig_a[["fid", "area_total_m2"]], on="fid", how="left")
    )
    inc["proporcao"] = inc.area_m2 / inc.area_total_m2.replace(0, pd.NA)
    inc["area_ha"] = inc.area_m2 / 10_000

    antes = len(inc)
    inc = inc[
        (inc.proporcao >= LIMIAR_SLIVER_PROPORCAO) | (inc.area_ha >= LIMIAR_SLIVER_HA)
    ]
    log(
        f"{antes - len(inc)} lascas de borda descartadas "
        f"(< {LIMIAR_SLIVER_PROPORCAO:.1%} da área e < {LIMIAR_SLIVER_HA} ha)"
    )
    log(f"{len(inc)} pares processo×município retidos")
    return inc.sort_values(["fid", "proporcao"], ascending=[True, False])


# ---------------------------------------------------------------------------
# A.4 — filtro, atributos e exportação
# ---------------------------------------------------------------------------


def montar_processos(
    sig: gpd.GeoDataFrame, inc: pd.DataFrame
) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    etapa("A.4 — filtro aos municípios da amostra e montagem de atributos")

    fids_amostra = sorted(set(inc.loc[inc.CD_MUN.isin(CODIGOS), "fid"]))
    log(f"{len(fids_amostra)} processos incidem em ao menos um município da amostra")

    inc_rel = inc[inc.fid.isin(fids_amostra)]
    por_fid: dict[int, list[dict]] = {}
    for row in inc_rel.itertuples():
        por_fid.setdefault(row.fid, []).append(
            {
                "cd_mun": row.CD_MUN,
                "nm_mun": row.NM_MUN,
                "proporcao": round(float(row.proporcao), 4),
                "area_ha": round(float(row.area_ha), 2),
            }
        )

    proc = sig[sig.fid.isin(fids_amostra)].copy()
    proc["municipios"] = proc.fid.map(por_fid)
    proc["cruza_divisa"] = proc.municipios.map(len) > 1
    proc["processo"] = [
        formatar_processo(n, a) for n, a in zip(proc.NUMERO, proc.ANO, strict=True)
    ]

    saida = proc.rename(
        columns={
            "NUMERO": "numero",
            "ANO": "ano",
            "FASE": "fase",
            "SUBS": "substancia",
            "NOME": "titular",
            "USO": "uso",
            "AREA_HA": "area_ha",
            "ULT_EVENTO": "ultimo_evento",
        }
    )[
        [
            "processo",
            "processo_norm",
            "numero",
            "ano",
            "fase",
            "substancia",
            "titular",
            "uso",
            "area_ha",
            "ultimo_evento",
            "municipios",
            "cruza_divisa",
            "geometry",
        ]
    ]

    for col in ["fase", "substancia", "titular", "uso", "ultimo_evento"]:
        saida[col] = saida[col].fillna("").astype(str).str.strip()
    saida["numero"] = saida.numero.astype(int)
    saida["ano"] = saida.ano.astype(int)
    saida["area_ha"] = saida.area_ha.astype(float).round(2)

    log(f"{int(saida.cruza_divisa.sum())} deles cruzam divisa municipal (insumo de A.7)")
    return saida.reset_index(drop=True), inc_rel


# ---------------------------------------------------------------------------
# Exportação com simplificação topológica
# ---------------------------------------------------------------------------


def tem_mapshaper() -> bool:
    return shutil.which("mapshaper") is not None or shutil.which("npx") is not None


def simplificar(entrada: Path, saida: Path, tolerancia: str) -> None:
    exe = shutil.which("mapshaper")
    cmd = [exe] if exe else [shutil.which("npx"), "--yes", "mapshaper"]
    cmd += [
        str(entrada),
        "-simplify",
        "visvalingam",
        tolerancia,
        "keep-shapes",
        "-clean",
        "-o",
        "format=geojson",
        "precision=0.000001",
        "force",
        str(saida),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def exportar(
    gdf: gpd.GeoDataFrame, destino: Path, teto_kb: float, rotulo: str
) -> dict:
    """Grava GeoJSON, simplificando o mínimo necessário para caber no teto."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    cru = destino.with_suffix(".raw.geojson")
    gdf.to_file(cru, driver="GeoJSON")

    if tamanho(cru) <= teto_kb:
        cru.replace(destino)
        log(f"{rotulo}: {tamanho(destino):.0f} KB sem simplificar (teto {teto_kb:.0f} KB)")
        return {"simplificacao": None, "kb": round(tamanho(destino), 1)}

    if not tem_mapshaper():
        cru.replace(destino)
        log(
            f"AVISO {rotulo}: {tamanho(destino):.0f} KB acima do teto e mapshaper "
            "indisponível — exportado sem simplificar"
        )
        return {"simplificacao": "INDISPONIVEL", "kb": round(tamanho(destino), 1)}

    usada = None
    for tol in ESCADA_SIMPLIFICACAO:
        simplificar(cru, destino, tol)
        kb = tamanho(destino)
        log(f"{rotulo}: simplify {tol} → {kb:.0f} KB")
        usada = tol
        if kb <= teto_kb:
            break
    cru.unlink(missing_ok=True)

    kb = tamanho(destino)
    if kb > teto_kb:
        log(f"AVISO {rotulo}: {kb:.0f} KB ainda acima do teto de {teto_kb:.0f} KB")
    return {"simplificacao": usada, "kb": round(kb, 1)}


# ---------------------------------------------------------------------------
# A.5 / A.7 — índice de busca e candidatos de divisa
# ---------------------------------------------------------------------------


def escrever_indice(proc: gpd.GeoDataFrame, destino: Path) -> None:
    etapa("A.5 — índice de busca processo → feature")
    registros = [
        {
            "processo": r.processo,
            "processo_norm": r.processo_norm,
            "fase": r.fase,
            "substancia": r.substancia,
            "titular": r.titular,
            "area_ha": r.area_ha,
            "municipios": [m["nm_mun"] for m in r.municipios],
            "cruza_divisa": bool(r.cruza_divisa),
        }
        for r in proc.itertuples()
    ]
    registros.sort(key=lambda x: x["processo_norm"])

    duplicados = len(registros) - len({r["processo_norm"] for r in registros})
    if duplicados:
        log(f"AVISO: {duplicados} números de processo repetidos no SIGMINE")

    destino.write_text(
        json.dumps(registros, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    log(f"{len(registros)} entradas · {tamanho(destino):.0f} KB")


def escrever_candidatos_divisa(proc: gpd.GeoDataFrame, destino: Path) -> int:
    etapa("A.7 — processos cuja poligonal cruza divisa municipal")
    cand = proc[proc.cruza_divisa].copy()
    cand = cand.assign(_n=cand.municipios.map(len)).sort_values(
        ["_n", "area_ha"], ascending=False
    )
    registros = [
        {
            "processo": r.processo,
            "fase": r.fase,
            "substancia": r.substancia,
            "titular": r.titular,
            "area_ha": r.area_ha,
            "n_municipios": len(r.municipios),
            "municipios": r.municipios,
            # a escolha final depende do dossiê C.2: interessa o par de
            # municípios com status de habilitação DIVERGENTE
            "na_amostra": [m["nm_mun"] for m in r.municipios if m["cd_mun"] in CODIGOS],
            "fora_da_amostra": [
                m["nm_mun"] for m in r.municipios if m["cd_mun"] not in CODIGOS
            ],
        }
        for r in cand.itertuples()
    ]
    destino.write_text(
        json.dumps(registros, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"{len(registros)} candidatos · {destino.name}")
    for r in registros[:5]:
        log(f"    {r['processo']:>14}  {r['substancia'][:22]:22}  {' + '.join(m['nm_mun'] for m in r['municipios'])}")
    return len(registros)


# ---------------------------------------------------------------------------
# Orquestração
# ---------------------------------------------------------------------------


def main() -> None:
    if not SIGMINE_SHP.exists() or not MALHA_SHP.exists():
        raise SystemExit("brutos ausentes em data_source/ — ver README, seção Fontes")

    SAIDA.mkdir(parents=True, exist_ok=True)

    malha = carregar_malha()
    amostra = malha[malha.CD_MUN.isin(CODIGOS)].copy()
    amostra["nm_mun"] = amostra.CD_MUN.map(lambda c: AMOSTRA[c][0])
    amostra = amostra.rename(columns={"CD_MUN": "cd_mun", "AREA_KM2": "area_km2"})[
        ["cd_mun", "nm_mun", "area_km2", "geometry"]
    ]
    meta_mun = exportar(
        amostra, SAIDA / "municipios10.geojson", TETO_MUNICIPIOS_KB, "municipios10"
    )

    sig = carregar_sigmine()
    inc = incidencia_municipal(sig, malha)
    proc, _ = montar_processos(sig, inc)

    meta_proc = exportar(
        proc, SAIDA / "processos.geojson", TETO_PROCESSOS_MB * 1024, "processos"
    )
    escrever_indice(proc, SAIDA / "indice_processos.json")
    n_divisa = escrever_candidatos_divisa(proc, SAIDA / "candidatos_divisa.json")

    etapa("metadados")
    meta = {
        "gerado_por": "pipeline/prep.py",
        "crs_entrada": "EPSG:4674 (SIRGAS 2000)",
        "crs_calculo_de_area": CRS_AREA,
        "limiar_sliver": {
            "proporcao": LIMIAR_SLIVER_PROPORCAO,
            "area_ha": LIMIAR_SLIVER_HA,
        },
        "municipios_amostra": [
            {"cd_mun": c, "nm_mun": v[0], "perfil": v[1]} for c, v in AMOSTRA.items()
        ],
        "contagens": {
            "municipios_na_malha": int(len(malha)),
            "municipios_amostra": int(len(amostra)),
            "processos_sigmine_bahia": int(len(sig)),
            "processos_na_amostra": int(len(proc)),
            "processos_cruzando_divisa": int(n_divisa),
        },
        "arquivos": {
            "municipios10.geojson": meta_mun,
            "processos.geojson": meta_proc,
        },
    }
    (SAIDA / "metadata.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log("metadata.json")

    print(f"\nPronto. Artefatos em {SAIDA.relative_to(RAIZ)}/\n", flush=True)


if __name__ == "__main__":
    main()
