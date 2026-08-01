/**
 * ESCOPO A.9 — desenho de polígono e ponto+raio geodésico.
 *
 * Critério de aceite: círculo em graus decimais é elipse deformada — o modo
 * ponto+raio usa `turf.circle` em quilômetros, nunca um raio construído em
 * graus. Mapa sem tiles (F.6): só as camadas GeoJSON da amostra, sobre fundo
 * neutro, para carregar instantâneo e offline.
 *
 * Porte do app antigo para a linguagem visual desta tela: mesmos cálculos,
 * controles em HTML puro.
 */

import { useEffect, useRef, useState } from 'react'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { derivarMunicipios } from '@/lib/municipios'
import type { IncidenciaMunicipal } from '@/lib/schemas'

import { CAIXA_BAHIA, CORES, fmt2 } from './dados'
import { GrupoSegmentado, estiloSegmento, s } from './ui'

const BASE = `${import.meta.env.BASE_URL}data`

const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': CORES.terraMapa } }],
}

const FONTE_VAZIA: FeatureCollection = { type: 'FeatureCollection', features: [] }

export type ModoDesenho = 'poligono' | 'ponto-raio'

export interface ResultadoDesenho {
  geometria: Feature<Polygon>
  area_ha: number
  municipios: IncidenciaMunicipal[]
}

export interface MapaDesenhoProps {
  onConcluir: (resultado: ResultadoDesenho) => void
  onCancelar: () => void
}

const MODOS: { k: ModoDesenho; rotulo: string }[] = [
  { k: 'poligono', rotulo: 'Desenhar' },
  { k: 'ponto-raio', rotulo: 'Ponto e raio' },
]

export default function MapaDesenho({ onConcluir, onCancelar }: MapaDesenhoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const [modo, setModo] = useState<ModoDesenho>('poligono')
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [centro, setCentro] = useState<[number, number] | null>(null)
  const [raioKm, setRaioKm] = useState(1)
  const [calculando, setCalculando] = useState(false)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    // Mesma proteção do mapa de leitura: sem WebGL2 o construtor lança, e um
    // erro aqui derrubaria a aplicação inteira.
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: ESTILO,
        bounds: [
          [CAIXA_BAHIA[0], CAIXA_BAHIA[1]],
          [CAIXA_BAHIA[2], CAIXA_BAHIA[3]],
        ],
        fitBoundsOptions: { padding: 20 },
        attributionControl: false,
      })
    } catch {
      setFalhou(true)
      return
    }
    mapRef.current = map

    map.on('load', () => {
      map.addSource('municipios', { type: 'geojson', data: `${BASE}/municipios10.geojson` })
      map.addLayer({
        id: 'municipios-preenchimento',
        type: 'fill',
        source: 'municipios',
        paint: { 'fill-color': CORES.branco, 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'municipios-linha',
        type: 'line',
        source: 'municipios',
        paint: { 'line-color': CORES.bordaMapa, 'line-width': 1 },
      })

      map.addSource('desenho', { type: 'geojson', data: FONTE_VAZIA })
      map.addLayer({
        id: 'desenho-preenchimento',
        type: 'fill',
        source: 'desenho',
        paint: { 'fill-color': CORES.verde, 'fill-opacity': 0.28 },
      })
      map.addLayer({
        id: 'desenho-linha',
        type: 'line',
        source: 'desenho',
        paint: { 'line-color': CORES.verde, 'line-width': 2 },
      })
      map.addLayer({
        id: 'desenho-pontos',
        type: 'circle',
        source: 'desenho',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': CORES.verde,
          'circle-radius': 5,
          'circle-stroke-color': CORES.branco,
          'circle-stroke-width': 2,
        },
      })
    })

    return () => {
      try {
        map.remove()
      } catch {
        /* nada a desmontar */
      }
      mapRef.current = null
    }
  }, [])

  // Captura de clique — depende do modo, por isso reinscreve quando ele muda.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function aoClicar(e: maplibregl.MapMouseEvent) {
      const ponto: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (modo === 'poligono') setVertices((v) => [...v, ponto])
      else setCentro(ponto)
    }

    map.on('click', aoClicar)
    return () => {
      map.off('click', aoClicar)
    }
  }, [modo])

  useEffect(() => {
    const fonte = mapRef.current?.getSource('desenho') as maplibregl.GeoJSONSource | undefined
    if (!fonte) return

    if (modo === 'poligono') {
      const features: Feature[] = vertices.map((v) => turf.point(v))
      if (vertices.length >= 3) features.push(turf.polygon([[...vertices, vertices[0]]]))
      else if (vertices.length === 2) features.push(turf.lineString(vertices))
      fonte.setData({ type: 'FeatureCollection', features })
      return
    }

    const features: Feature[] = []
    if (centro) {
      features.push(turf.point(centro))
      features.push(turf.circle(centro, raioKm, { steps: 64, units: 'kilometers' }))
    }
    fonte.setData({ type: 'FeatureCollection', features })
  }, [modo, vertices, centro, raioKm])

  const pronto = modo === 'poligono' ? vertices.length >= 3 : centro !== null

  const poligonoAtual = (): Feature<Polygon> | null => {
    if (modo === 'poligono' && vertices.length >= 3) {
      return turf.polygon([[...vertices, vertices[0]]])
    }
    if (modo === 'ponto-raio' && centro) {
      return turf.circle(centro, raioKm, { steps: 64, units: 'kilometers' })
    }
    return null
  }

  const previaHa = (() => {
    const p = poligonoAtual()
    return p ? turf.area(p) / 10_000 : null
  })()

  async function concluir() {
    const poligono = poligonoAtual()
    if (!poligono) return
    setCalculando(true)
    try {
      const municipios = await derivarMunicipios(poligono)
      onConcluir({ geometria: poligono, area_ha: turf.area(poligono) / 10_000, municipios })
    } finally {
      setCalculando(false)
    }
  }

  function limpar() {
    setVertices([])
    setCentro(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GrupoSegmentado>
        {MODOS.map(({ k, rotulo }, i) => (
          <button
            type="button"
            key={k}
            onClick={() => {
              setModo(k)
              limpar()
            }}
            style={estiloSegmento(modo === k, i === 0, false)}
          >
            {rotulo}
          </button>
        ))}
      </GrupoSegmentado>

      <div style={{ fontSize: 15, color: CORES.cinza }}>
        {modo === 'poligono'
          ? 'Clique no mapa para marcar cada vértice. Mínimo de 3 pontos.'
          : 'Clique no mapa para marcar o centro, depois ajuste o raio.'}
      </div>

      {falhou ? (
        <div
          style={{
            height: 380,
            width: '100%',
            border: `1px solid ${CORES.linhaForte}`,
            background: CORES.terraMapa,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            fontSize: 15,
            color: CORES.cinzaEscuro,
            lineHeight: 1.55,
          }}
        >
          Este navegador não expõe WebGL2, necessário para desenhar no mapa. Use a busca por
          processo da ANM.
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{ height: 380, width: '100%', border: `1px solid ${CORES.linhaForte}` }}
        />
      )}

      {modo === 'ponto-raio' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 15,
              color: CORES.terra,
            }}
          >
            <span>Raio</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{raioKm.toFixed(1)} km</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.1}
            value={raioKm}
            onChange={(e) => setRaioKm(Number(e.target.value))}
            aria-label="raio em quilômetros"
            style={{ width: '100%', height: 30, marginTop: 8 }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'space-between',
          borderTop: `1px solid ${CORES.linha}`,
          paddingTop: 16,
        }}
      >
        <div style={{ fontSize: 15, color: CORES.cinza, fontVariantNumeric: 'tabular-nums' }}>
          {modo === 'poligono'
            ? `${vertices.length} vértice${vertices.length === 1 ? '' : 's'}`
            : centro
              ? 'centro marcado'
              : 'nenhum centro marcado'}
          {previaHa !== null && ` · ${fmt2(previaHa)} ha`}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={limpar}
            disabled={calculando}
            style={{
              height: 46,
              padding: '0 18px',
              background: 'transparent',
              border: `1px solid ${CORES.linhaForte}`,
              fontSize: 15,
            }}
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onCancelar}
            disabled={calculando}
            style={{
              height: 46,
              padding: '0 18px',
              background: 'transparent',
              border: `1px solid ${CORES.linhaForte}`,
              fontSize: 15,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="pc-primario"
            onClick={concluir}
            disabled={!pronto || calculando}
            style={{ ...s.primario, height: 46, padding: '0 22px', opacity: pronto ? 1 : 0.5 }}
          >
            {calculando ? 'Calculando…' : 'Concluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
