/**
 * ESCOPO A.9 — deriva `municipios[]` de uma geometria desenhada à mão, pelo
 * mesmo método do *spatial join* de A.3 (pipeline/municipios.py), só que no
 * cliente: intersecta contra `municipios10.geojson`, já embarcado.
 */

import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

import type { IncidenciaMunicipal } from '@/lib/schemas'

const BASE = `${import.meta.env.BASE_URL}data`

let cache: Promise<FeatureCollection> | null = null

function carregarMunicipios(): Promise<FeatureCollection> {
  cache ??= fetch(`${BASE}/municipios10.geojson`).then((r) => {
    if (!r.ok) throw new Error(`municipios10.geojson: HTTP ${r.status}`)
    return r.json() as Promise<FeatureCollection>
  })
  return cache
}

/**
 * Município de cada feição, com proporção de área da poligonal dentro dele.
 * Ordenado por proporção decrescente, igual ao contrato de A.3.
 */
export async function derivarMunicipios(
  poligono: Feature<Polygon>,
): Promise<IncidenciaMunicipal[]> {
  const malha = await carregarMunicipios()
  const areaTotal = turf.area(poligono)
  if (areaTotal === 0) return []

  const incidencias: IncidenciaMunicipal[] = []
  for (const feicao of malha.features) {
    if (feicao.geometry?.type !== 'Polygon' && feicao.geometry?.type !== 'MultiPolygon') continue
    if (!turf.booleanIntersects(poligono, feicao)) continue
    let intersecao: Feature<Polygon | MultiPolygon> | null = null
    try {
      intersecao = turf.intersect(
        turf.featureCollection([poligono, feicao as Feature<Polygon | MultiPolygon>]),
      )
    } catch {
      continue
    }
    if (!intersecao) continue

    const areaIntersecao = turf.area(intersecao)
    if (areaIntersecao <= 0) continue

    const props = feicao.properties as { cd_mun: string; nm_mun: string }
    incidencias.push({
      cd_mun: props.cd_mun,
      nm_mun: props.nm_mun,
      proporcao: areaIntersecao / areaTotal,
      area_ha: areaIntersecao / 10_000,
    })
  }

  return incidencias.sort((a, b) => b.proporcao - a.proporcao)
}
