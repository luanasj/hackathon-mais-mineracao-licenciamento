/**
 * Mapa de leitura da poligonal (ESCOPO A / F.6-b).
 *
 * Substitui o mapa de protótipo, que desenhava um polígono sintético igual
 * para todo município: aqui a geometria é a feição real do SIGMINE, vinda de
 * `public/data/processos.geojson` pelo índice de A.5.
 *
 * Sem tiles remotos (DoD — roda com a rede desligada): fundo neutro, malha
 * municipal do IBGE e relevo `terrain-rgb` baixado uma vez por
 * `pipeline/relevo.py`, ambos servidos de `public/data/`.
 */

import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { Caixa } from './dados'
import { CAIXA_BAHIA, CAIXA_BRASIL, CORES } from './dados'

const BASE = `${import.meta.env.BASE_URL}data`

export type NivelZoom = 'brasil' | 'bahia' | 'area'

export interface MapaHandle {
  /** Aproxima (fator > 1) ou afasta (fator < 1) sobre o centro atual. */
  escalar: (fator: number) => void
}

const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': CORES.terraMapa } }],
}

const FONTE_VAZIA: FeatureCollection = { type: 'FeatureCollection', features: [] }

function limites(caixa: Caixa): maplibregl.LngLatBoundsLike {
  return [
    [caixa[0], caixa[1]],
    [caixa[2], caixa[3]],
  ]
}

export interface MapaProcessoProps {
  geometria: Feature | null
  nivel: NivelZoom
  altura?: number
  ref?: Ref<MapaHandle>
}

export default function MapaProcesso({ geometria, nivel, altura = 340, ref }: MapaProcessoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const prontoRef = useRef(false)

  useImperativeHandle(ref, () => ({
    escalar(fator) {
      const map = mapRef.current
      if (!map) return
      map.easeTo({ zoom: map.getZoom() + Math.log2(fator), duration: 220 })
    },
  }))

  // Inicialização — uma vez. Ordem de pintura: relevo, malha, poligonal.
  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO,
      bounds: limites(CAIXA_BAHIA),
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    })
    mapRef.current = map

    // @ts-expect-error debug temporário
    window.__mapa = map
    // @ts-expect-error debug temporário
    window.__erroLoad = null
    map.on('error', (e) => {
      // @ts-expect-error debug temporário
      window.__erroLoad = String(e.error?.message ?? e.error ?? e)
    })
    map.on('load', () => {
      try {
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
          'hillshade-exaggeration': 0.55,
          'hillshade-shadow-color': '#8d8674',
          'hillshade-highlight-color': '#fffdf8',
          'hillshade-accent-color': '#a89f89',
        },
      })

      map.addSource('municipios', { type: 'geojson', data: `${BASE}/municipios10.geojson` })
      map.addLayer({
        id: 'municipios-preenchimento',
        type: 'fill',
        source: 'municipios',
        paint: { 'fill-color': CORES.branco, 'fill-opacity': 0.18 },
      })
      map.addLayer({
        id: 'municipios-linha',
        type: 'line',
        source: 'municipios',
        paint: { 'line-color': CORES.bordaMapa, 'line-width': 1 },
      })

      map.addSource('poligonal', { type: 'geojson', data: FONTE_VAZIA })
      map.addLayer({
        id: 'poligonal-preenchimento',
        type: 'fill',
        source: 'poligonal',
        paint: { 'fill-color': CORES.verde, 'fill-opacity': 0.28 },
      })
      map.addLayer({
        id: 'poligonal-linha',
        type: 'line',
        source: 'poligonal',
        paint: { 'line-color': CORES.verde, 'line-width': 2 },
      })

      prontoRef.current = true
      pintar(map, geometria)
      enquadrar(map, nivel, geometria, false)
      } catch (err) {
        // @ts-expect-error debug temporário
        window.__erroLoad = 'THROW no load: ' + String(err)
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
      prontoRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Geometria nova: repinta e reenquadra. Trocar de processo sem mover a
  // câmera deixaria o usuário olhando para o lugar errado do estado.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !prontoRef.current) return
    pintar(map, geometria)
    enquadrar(map, nivel, geometria, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometria])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !prontoRef.current) return
    enquadrar(map, nivel, geometria, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Mapa da poligonal do processo sobre a malha municipal da Bahia"
      style={{
        height: altura,
        width: '100%',
        border: `1px solid ${CORES.linhaForte}`,
        background: CORES.terraMapa,
      }}
    />
  )
}

function pintar(map: maplibregl.Map, geometria: Feature | null) {
  const fonte = map.getSource('poligonal') as maplibregl.GeoJSONSource | undefined
  if (!fonte) return
  fonte.setData(geometria ? { type: 'FeatureCollection', features: [geometria] } : FONTE_VAZIA)
}

/**
 * "A área" só existe quando há geometria; sem ela o nível cai para Bahia, em
 * vez de enquadrar o vazio.
 */
function enquadrar(
  map: maplibregl.Map,
  nivel: NivelZoom,
  geometria: Feature | null,
  animar: boolean,
) {
  const opcoes = { padding: 32, duration: animar ? 600 : 0 }

  if (nivel === 'area' && geometria) {
    const [oeste, sul, leste, norte] = turf.bbox(geometria)
    map.fitBounds(
      [
        [oeste, sul],
        [leste, norte],
      ],
      { ...opcoes, maxZoom: 13 },
    )
    return
  }

  map.fitBounds(limites(nivel === 'brasil' ? CAIXA_BRASIL : CAIXA_BAHIA), opcoes)
}
