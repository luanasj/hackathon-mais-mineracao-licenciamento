import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { select, type Selection } from 'd3-selection'
import { zoom as criarZoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry, MultiPoint } from 'geojson'
import { CAIXA_BAHIA, CIDADES, CORES } from './dados'

export type NivelZoom = 'brasil' | 'bahia' | 'area'

export type MapaHandle = {
  /** Aproxima (fator > 1) ou afasta (fator < 1) com transição. */
  escalar: (fator: number) => void
}

type Props = {
  centro: [number, number]
  nivel: NivelZoom
  /** Nome do município rotulado sobre a poligonal. */
  rotulo: string
  ref?: React.Ref<MapaHandle>
}

type Atlas = { mundo: Feature<Geometry>[]; brasil: Feature<Geometry> | null }

/** O atlas é imutável e pesado: carrega uma vez por página, não por montagem. */
let atlasPendente: Promise<Atlas> | null = null

function carregarAtlas(): Promise<Atlas> {
  if (!atlasPendente) {
    atlasPendente = fetch(`${import.meta.env.BASE_URL}countries-110m.json`)
      .then((r) => r.json() as Promise<Topology<{ countries: GeometryCollection }>>)
      .then((topo) => {
        const paises = feature(topo, topo.objects.countries) as FeatureCollection
        const brasil = paises.features.find(
          (f) => (f.properties as { name?: string } | null)?.name === 'Brazil',
        )
        return { mundo: paises.features, brasil: brasil ?? null }
      })
      .catch((erro) => {
        atlasPendente = null
        throw erro
      })
  }
  return atlasPendente
}

/** Poligonal sintética do processo, desenhada em torno do centro do município. */
function poligonal([lon, lat]: [number, number]): Feature<Geometry> {
  const d = 0.055
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lon - d * 0.7, lat + d * 0.9],
          [lon + d * 0.8, lat + d * 0.7],
          [lon + d * 1.0, lat - d * 0.2],
          [lon + d * 0.3, lat - d * 0.9],
          [lon - d * 0.8, lat - d * 0.6],
          [lon - d * 0.7, lat + d * 0.9],
        ],
      ],
    },
  }
}

const caixa = (oeste: number, sul: number, leste: number, norte: number): MultiPoint => ({
  type: 'MultiPoint',
  coordinates: [
    [oeste, sul],
    [leste, norte],
  ],
})

const moldura = (
  oeste: number,
  sul: number,
  leste: number,
  norte: number,
): Feature<Geometry> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [oeste, sul],
      [oeste, norte],
      [leste, norte],
      [leste, sul],
      [oeste, sul],
    ],
  },
})

export default function MapaProcesso({ centro, nivel, rotulo, ref }: Props) {
  const [lon, lat] = centro
  const hostRef = useRef<HTMLDivElement>(null)
  const atlasRef = useRef<Atlas | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const chaveRef = useRef<string>('')
  const svgRef = useRef<Selection<SVGSVGElement, number, HTMLDivElement, unknown> | null>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, number> | null>(null)
  const repintarRef = useRef<number | undefined>(undefined)
  // O handler de zoom precisa repintar, mas é criado dentro do próprio `pintar`.
  const pintarRef = useRef<() => void>(() => {})

  const pintar = useCallback(() => {
    const el = hostRef.current
    const atlas = atlasRef.current
    if (!el || !atlas) return

    const largura = el.clientWidth || 560
    const altura = el.clientHeight || 380
    const cen: [number, number] = [lon, lat]
    const poli = poligonal(cen)

    const alvo =
      nivel === 'brasil'
        ? atlas.brasil ?? caixa(...CAIXA_BAHIA)
        : nivel === 'bahia'
          ? caixa(...CAIXA_BAHIA)
          : caixa(cen[0] - 0.14, cen[1] - 0.14, cen[0] + 0.14, cen[1] + 0.14)

    const proj = geoMercator().fitExtent(
      [
        [14, 14],
        [largura - 14, altura - 14],
      ],
      alvo,
    )

    // Trocar de enquadramento, de município ou de largura zera o pan/zoom manual.
    const chave = `${nivel}|${lon},${lat}|${largura}`
    if (chaveRef.current !== chave) {
      chaveRef.current = chave
      transformRef.current = zoomIdentity
    }

    const caminho = geoPath(proj)
    const svg = select(el)
      .selectAll<SVGSVGElement, number>('svg')
      .data([0])
      .join('svg')
      .attr('width', largura)
      .attr('height', altura)
      .attr('viewBox', `0 0 ${largura} ${altura}`)
      .style('display', 'block')
      .style('background', CORES.terraMapa)
      .style('cursor', 'grab')
    svg.selectAll('*').remove()

    const t = transformRef.current
    const camada = svg.append('g').attr('transform', t.toString())

    const zoom = criarZoom<SVGSVGElement, number>()
      .scaleExtent([1, 60])
      .on('zoom', (ev: { transform: ZoomTransform }) => {
        transformRef.current = ev.transform
        camada.attr('transform', ev.transform.toString())
        // Rótulos e raios dependem de k: repinta após o gesto assentar.
        clearTimeout(repintarRef.current)
        repintarRef.current = setTimeout(() => pintarRef.current(), 90)
      })
    svgRef.current = svg
    zoomRef.current = zoom
    svg.call(zoom).call(zoom.transform, t)

    camada
      .append('path')
      .attr('d', caminho({ type: 'Sphere' }))
      .attr('fill', CORES.mar)
      .attr('stroke', 'none')

    camada
      .append('g')
      .selectAll('path')
      .data(atlas.mundo)
      .enter()
      .append('path')
      .attr('d', (d) => caminho(d))
      .attr('fill', (d) => (d === atlas.brasil ? CORES.brasilMapa : CORES.terraMapa))
      .attr('stroke', CORES.bordaMapa)
      .attr('stroke-width', 0.7)

    if (atlas.brasil) {
      camada
        .append('path')
        .attr('d', caminho(atlas.brasil))
        .attr('fill', 'none')
        .attr('stroke', CORES.cinzaClaro)
        .attr('stroke-width', 1.1)
    }

    if (nivel !== 'brasil') {
      camada
        .append('path')
        .attr('d', caminho(moldura(...CAIXA_BAHIA)))
        .attr('fill', 'none')
        .attr('stroke', CORES.terraClara)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4')
    }

    camada
      .append('path')
      .attr('d', caminho(poli))
      .attr('fill', CORES.verde)
      .attr('fill-opacity', 0.28)
      .attr('stroke', CORES.verde)
      .attr('stroke-width', 1.6)

    if (nivel === 'area') {
      // Barra de escala: 0,0451° de longitude ≈ 5 km nesta latitude.
      const a = proj([cen[0], cen[1]])
      const b = proj([cen[0] + 0.0451, cen[1]])
      if (a && b) {
        const px = Math.abs(b[0] - a[0])
        const y = altura - 22
        const x0 = 22
        const risco = (x1: number, y1: number, x2: number, y2: number) =>
          camada
            .append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', CORES.cinza)
            .attr('stroke-width', 1)
        risco(x0, y, x0 + px, y)
        risco(x0, y - 4, x0, y + 4)
        risco(x0 + px, y - 4, x0 + px, y + 4)
        camada
          .append('text')
          .attr('x', x0 + px / 2)
          .attr('y', y - 8)
          .attr('text-anchor', 'middle')
          .attr('font-family', 'IBM Plex Sans, sans-serif')
          .attr('font-size', 11)
          .attr('fill', CORES.cinza)
          .text('5 km')
      }
    }

    const k = t.k
    const limite =
      nivel === 'brasil' ? (k >= 6 ? 3 : k >= 3 ? 2 : 1) : k >= 3 ? 3 : k >= 1.4 ? 3 : 2
    const gc = camada.append('g')
    const ocupados: { x: number; y: number; w: number; h: number }[] = []

    for (const cid of CIDADES.filter((c) => c.i <= limite)) {
      const q = proj(cid.c)
      if (!q) continue
      gc.append('circle')
        .attr('cx', q[0])
        .attr('cy', q[1])
        .attr('r', (cid.i === 1 ? 3 : 2) / k)
        .attr('fill', CORES.cinzaClaro)

      // Colisão de rótulos é medida em coordenadas de tela, já com o zoom aplicado.
      const tela = [t.applyX(q[0]), t.applyY(q[1])]
      const corpo = cid.i === 1 ? 12 : 11
      const larguraTexto = cid.n.length * corpo * 0.56
      const cabe = tela[0] + 6 + larguraTexto <= largura - 6
      const x0 = cabe ? tela[0] + 6 : tela[0] - 6 - larguraTexto
      if (x0 < 4) continue
      const cx = { x: x0, y: tela[1] - corpo, w: larguraTexto, h: corpo + 4 }
      const bate = ocupados.some(
        (o) => cx.x < o.x + o.w && cx.x + cx.w > o.x && cx.y < o.y + o.h && cx.y + cx.h > o.y,
      )
      if (bate) continue
      ocupados.push(cx)
      gc.append('text')
        .attr('x', cabe ? q[0] + 6 / k : q[0] - 6 / k)
        .attr('y', q[1] + 3.5 / k)
        .attr('text-anchor', cabe ? 'start' : 'end')
        .attr('font-family', 'IBM Plex Sans, sans-serif')
        .attr('font-size', corpo / k)
        .attr('fill', CORES.cinzaEscuro)
        .text(cid.n)
    }

    const p = proj(cen)
    if (p) {
      camada
        .append('circle')
        .attr('cx', p[0])
        .attr('cy', p[1])
        .attr('r', (nivel === 'area' ? 3.5 : 6) / k)
        .attr('fill', CORES.terra)
        .attr('stroke', CORES.branco)
        .attr('stroke-width', 1.4)
      const cabe = p[0] + 11 + rotulo.length * 7.4 <= largura - 8
      camada
        .append('text')
        .attr('x', cabe ? p[0] + 11 / k : p[0] - 11 / k)
        .attr('y', p[1] + 4 / k)
        .attr('text-anchor', cabe ? 'start' : 'end')
        .attr('font-family', 'IBM Plex Sans, sans-serif')
        .attr('font-size', 14 / k)
        .attr('font-weight', 500)
        .attr('fill', CORES.tinta)
        .text(rotulo)
    }
  }, [lon, lat, nivel, rotulo])

  useEffect(() => {
    pintarRef.current = pintar
  }, [pintar])

  useEffect(() => {
    let vivo = true
    if (atlasRef.current) {
      pintar()
    } else {
      carregarAtlas()
        .then((atlas) => {
          if (!vivo) return
          atlasRef.current = atlas
          pintar()
        })
        .catch((erro) => console.error('Falha ao carregar o atlas do mapa', erro))
    }
    return () => {
      vivo = false
      clearTimeout(repintarRef.current)
    }
  }, [pintar])

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const obs = new ResizeObserver(() => pintar())
    obs.observe(el)
    return () => obs.disconnect()
  }, [pintar])

  useImperativeHandle(
    ref,
    () => ({
      escalar(fator: number) {
        const svg = svgRef.current
        const zoom = zoomRef.current
        if (!svg || !zoom) return
        svg.transition().duration(220).call(zoom.scaleBy, fator)
      },
    }),
    [],
  )

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        height: 'clamp(220px, 45vw, 380px)',
        border: `1px solid ${CORES.linha}`,
      }}
      role="img"
      aria-label="Mapa do Brasil com a poligonal do processo destacada na Bahia"
    />
  )
}
