/**
 * ESCOPO A.9 — desenho de polígono e ponto+raio geodésico.
 *
 * Critério de aceite: círculo em graus decimais é elipse deformada — o modo
 * ponto+raio usa `turf.circle` em quilômetros, nunca um raio construído em
 * graus. Mapa sem tiles (F.6): só as camadas GeoJSON da amostra, sobre fundo
 * neutro, para carregar instantâneo e offline.
 */

import { useEffect, useRef, useState } from 'react'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CircleDot, PencilLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { derivarMunicipios } from '@/lib/municipios'
import type { IncidenciaMunicipal } from '@/lib/schemas'

const BASE = `${import.meta.env.BASE_URL}data`

/** Fundo neutro, sem tiles remotos — carrega offline (DoD). */
const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'fundo', type: 'background', paint: { 'background-color': '#f4f4f2' } },
  ],
}

const FONTE_VAZIA: FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface ResultadoDesenho {
  geometria: Feature<Polygon>
  area_ha: number
  municipios: IncidenciaMunicipal[]
}

export interface MapaDesenhoProps {
  modo: 'poligono' | 'ponto-raio'
  onConcluir: (resultado: ResultadoDesenho) => void
  onCancelar: () => void
}

export function MapaDesenho({ modo, onConcluir, onCancelar }: MapaDesenhoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const [vertices, setVertices] = useState<[number, number][]>([])
  const [centro, setCentro] = useState<[number, number] | null>(null)
  const [raioKm, setRaioKm] = useState(1)
  const [calculando, setCalculando] = useState(false)

  // ---------------------------------------------------------------------
  // Inicialização do mapa — uma vez
  // ---------------------------------------------------------------------
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
      map.addSource('municipios', { type: 'geojson', data: `${BASE}/municipios10.geojson` })
      map.addLayer({
        id: 'municipios-linha',
        type: 'line',
        source: 'municipios',
        paint: { 'line-color': '#8a8a86', 'line-width': 1 },
      })

      map.addSource('desenho', { type: 'geojson', data: FONTE_VAZIA })
      map.addLayer({
        id: 'desenho-preenchimento',
        type: 'fill',
        source: 'desenho',
        paint: { 'fill-color': '#1f6f54', 'fill-opacity': 0.25 },
      })
      map.addLayer({
        id: 'desenho-linha',
        type: 'line',
        source: 'desenho',
        paint: { 'line-color': '#1f6f54', 'line-width': 2 },
      })
      map.addLayer({
        id: 'desenho-pontos',
        type: 'circle',
        source: 'desenho',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#1f6f54', 'circle-radius': 5 },
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------
  // Captura de clique — modo dependente
  // ---------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function aoClicar(e: maplibregl.MapMouseEvent) {
      const ponto: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (modo === 'poligono') {
        setVertices((v) => [...v, ponto])
      } else {
        setCentro(ponto)
      }
    }

    map.on('click', aoClicar)
    return () => {
      map.off('click', aoClicar)
    }
  }, [modo])

  // ---------------------------------------------------------------------
  // Redesenha a camada `desenho` a cada mudança de estado
  // ---------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    const fonte = map?.getSource('desenho') as maplibregl.GeoJSONSource | undefined
    if (!fonte) return

    if (modo === 'poligono') {
      const features: Feature[] = vertices.map((v) => turf.point(v))
      if (vertices.length >= 2) {
        const anel = vertices.length >= 3 ? [...vertices, vertices[0]] : vertices
        features.push(
          vertices.length >= 3
            ? turf.polygon([anel])
            : turf.lineString(vertices),
        )
      }
      fonte.setData({ type: 'FeatureCollection', features })
    } else {
      const features: Feature[] = []
      if (centro) {
        features.push(turf.point(centro))
        features.push(turf.circle(centro, raioKm, { steps: 64, units: 'kilometers' }))
      }
      fonte.setData({ type: 'FeatureCollection', features })
    }
  }, [modo, vertices, centro, raioKm])

  const pronto = modo === 'poligono' ? vertices.length >= 3 : centro !== null

  async function concluir() {
    let poligono: Feature<Polygon> | null = null

    if (modo === 'poligono' && vertices.length >= 3) {
      poligono = turf.polygon([[...vertices, vertices[0]]])
    } else if (modo === 'ponto-raio' && centro) {
      poligono = turf.circle(centro, raioKm, { steps: 64, units: 'kilometers' })
    }
    if (!poligono) return

    setCalculando(true)
    try {
      const [municipios] = await Promise.all([derivarMunicipios(poligono)])
      onConcluir({
        geometria: poligono,
        area_ha: turf.area(poligono) / 10_000,
        municipios,
      })
    } finally {
      setCalculando(false)
    }
  }

  function limpar() {
    setVertices([])
    setCentro(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-nota text-muted-foreground">
        {modo === 'poligono' ? (
          <>
            <PencilLine aria-hidden className="size-4" />
            Clique no mapa para adicionar vértices. Mínimo 3 pontos.
          </>
        ) : (
          <>
            <CircleDot aria-hidden className="size-4" />
            Clique no mapa para marcar o centro, depois ajuste o raio.
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-96 w-full overflow-hidden rounded-lg border"
      />

      {modo === 'ponto-raio' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-nota">
            <span className="font-medium">Raio</span>
            <span className="num text-muted-foreground">{raioKm.toFixed(1)} km</span>
          </div>
          <Slider
            min={0.1}
            max={20}
            step={0.1}
            value={[raioKm]}
            onValueChange={(v) => setRaioKm(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-nota text-muted-foreground">
          {modo === 'poligono'
            ? `${vertices.length} vértice(s)`
            : centro
              ? 'centro marcado'
              : 'nenhum centro marcado'}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={limpar} disabled={calculando}>
            Limpar
          </Button>
          <Button variant="outline" size="sm" onClick={onCancelar} disabled={calculando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={concluir} disabled={!pronto || calculando}>
            {calculando ? 'Calculando…' : 'Concluir'}
          </Button>
        </div>
      </div>
    </div>
  )
}
