/**
 * Mapa de leitura — mostra a poligonal do processo selecionado (SIGMINE),
 * sem interação de desenho. Companion somente-leitura de `MapaDesenho`.
 */

import { useEffect, useRef } from 'react'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASE = `${import.meta.env.BASE_URL}data`

/** Fundo neutro, sem tiles remotos — carrega offline (DoD), igual ao MapaDesenho. */
const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'fundo', type: 'background', paint: { 'background-color': '#f4f4f2' } },
  ],
}

const FONTE_VAZIA: FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface MapaVisualizacaoProps {
  geometria: Feature | null
  className?: string
}

export function MapaVisualizacao({ geometria, className }: MapaVisualizacaoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const prontoRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO,
      center: [-41.3, -11.6],
      zoom: 7,
    })
    mapRef.current = map

    map.on('load', () => {
      // relevo (F.6-b): tiles terrain-rgb locais, baixados uma vez por
      // `pipeline/relevo.py` — sem chamada de rede em tempo de execução.
      map.addSource('relevo', {
        type: 'raster-dem',
        tiles: [`${BASE}/terrain/{z}/{x}/{y}.png`],
        tileSize: 256,
        maxzoom: 9,
        encoding: 'terrarium',
      })
      map.addLayer({
        id: 'relevo-sombra',
        type: 'hillshade',
        source: 'relevo',
        paint: {
          'hillshade-exaggeration': 0.6,
          'hillshade-shadow-color': '#5c5c58',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#8a8a86',
        },
      })

      map.addSource('municipios', { type: 'geojson', data: `${BASE}/municipios10.geojson` })
      map.addLayer({
        id: 'municipios-linha',
        type: 'line',
        source: 'municipios',
        paint: { 'line-color': '#8a8a86', 'line-width': 1 },
      })

      map.addSource('poligonal', { type: 'geojson', data: FONTE_VAZIA })
      map.addLayer({
        id: 'poligonal-preenchimento',
        type: 'fill',
        source: 'poligonal',
        paint: { 'fill-color': '#1f6f54', 'fill-opacity': 0.25 },
      })
      map.addLayer({
        id: 'poligonal-linha',
        type: 'line',
        source: 'poligonal',
        paint: { 'line-color': '#1f6f54', 'line-width': 2 },
      })

      prontoRef.current = true
      atualizar(map, geometria)
    })

    return () => {
      map.remove()
      mapRef.current = null
      prontoRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current || !prontoRef.current) return
    atualizar(mapRef.current, geometria)
  }, [geometria])

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-80 w-full overflow-hidden rounded-lg border'}
    />
  )
}

function atualizar(map: maplibregl.Map, geometria: Feature | null) {
  const fonte = map.getSource('poligonal') as maplibregl.GeoJSONSource | undefined
  if (!fonte) return

  if (!geometria) {
    fonte.setData(FONTE_VAZIA)
    return
  }

  fonte.setData({ type: 'FeatureCollection', features: [geometria] })
  const [minX, minY, maxX, maxY] = turf.bbox(geometria)
  map.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: 32, duration: 0 },
  )
}
