/**
 * ESCOPO A.5 — índice de busca `processo → feature`, com normalização.
 *
 * Critério de aceite: `870123/2019`, `870.123/2019` e `8701232019` resolvem
 * para o mesmo registro. A normalização é a mesma do `pipeline/prep.py`
 * (`normalizar_processo`) — se uma mudar, a outra muda junto.
 *
 * Tudo aqui roda contra arquivo local em `public/data/`. Zero rede (DoD).
 */

import type { Feature, FeatureCollection } from 'geojson'

import type { ProcessoProps } from '@/lib/schemas'

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Reduz qualquer grafia a dígitos puros. É a chave do índice. */
export function normalizarProcesso(entrada: string): string {
  return (entrada ?? '').replace(/\D/g, '')
}

/**
 * Grafia canônica de exibição, padrão ANM: `870.123/2019`.
 * Números com menos de 6 dígitos (processos antigos) ficam sem separador.
 */
export function formatarProcesso(numero: number, ano: number): string {
  if (numero >= 100_000) {
    const milhar = Math.floor(numero / 1000)
    const resto = String(numero % 1000).padStart(3, '0')
    return `${milhar}.${resto}/${ano}`
  }
  return `${numero}/${ano}`
}

/**
 * Interpreta a entrada crua do usuário.
 *
 * Um número de processo ANM tem 10 dígitos: 6 de sequencial + 4 de ano.
 * Aceitamos também a digitação parcial, que vira prefixo para o autocomplete.
 */
export function interpretarEntrada(entrada: string): {
  digitos: string
  completo: boolean
  ano: number | null
} {
  const digitos = normalizarProcesso(entrada)
  const completo = digitos.length === 10
  const ano = completo ? Number(digitos.slice(6)) : null
  return { digitos, completo, ano }
}

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------

/** Registro leve do índice — sem geometria, para o autocomplete ser instantâneo. */
export interface RegistroIndice {
  processo: string
  processo_norm: string
  fase: string
  substancia: string
  titular: string
  area_ha: number
  municipios: string[]
  cruza_divisa: boolean
}

export interface IndiceProcessos {
  /** Busca exata por dígitos normalizados. */
  porNumero(entrada: string): RegistroIndice | null
  /** Autocomplete: prefixo de número, ou trecho de titular/substância. */
  sugerir(entrada: string, limite?: number): RegistroIndice[]
  /** Geometria do processo, carregada sob demanda do GeoJSON. */
  geometria(processoNorm: string): Promise<Feature | null>
  readonly total: number
}

const BASE = `${import.meta.env.BASE_URL}data`

let cacheGeoJSON: Promise<FeatureCollection> | null = null

function carregarGeoJSON(): Promise<FeatureCollection> {
  cacheGeoJSON ??= fetch(`${BASE}/processos.geojson`).then((r) => {
    if (!r.ok) throw new Error(`processos.geojson: HTTP ${r.status}`)
    return r.json() as Promise<FeatureCollection>
  })
  return cacheGeoJSON
}

/** Remove acento e caixa, para busca textual tolerante. */
function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function construirIndice(registros: RegistroIndice[]): IndiceProcessos {
  const porNum = new Map<string, RegistroIndice>()
  for (const r of registros) porNum.set(r.processo_norm, r)

  // pré-dobra o texto uma vez, para o autocomplete não recalcular a cada tecla
  const textos = registros.map((r) => dobrar(`${r.titular} ${r.substancia}`))

  return {
    total: registros.length,

    porNumero(entrada) {
      return porNum.get(normalizarProcesso(entrada)) ?? null
    },

    sugerir(entrada, limite = 8) {
      const bruto = (entrada ?? '').trim()
      if (bruto.length < 2) return []

      const digitos = normalizarProcesso(bruto)
      // entrada predominantemente numérica → busca por prefixo de número
      if (digitos.length >= 3 && digitos.length / bruto.length > 0.5) {
        const out: RegistroIndice[] = []
        for (const r of registros) {
          if (r.processo_norm.startsWith(digitos)) {
            out.push(r)
            if (out.length >= limite) break
          }
        }
        if (out.length) return out
      }

      const alvo = dobrar(bruto)
      const out: RegistroIndice[] = []
      for (let i = 0; i < registros.length; i++) {
        if (textos[i].includes(alvo)) {
          out.push(registros[i])
          if (out.length >= limite) break
        }
      }
      return out
    },

    async geometria(processoNorm) {
      const fc = await carregarGeoJSON()
      const alvo = normalizarProcesso(processoNorm)
      return (
        fc.features.find(
          (f: Feature) => (f.properties as ProcessoProps | null)?.processo_norm === alvo,
        ) ?? null
      )
    },
  }
}

/** Carrega o índice de `public/data/indice_processos.json`. */
export async function carregarIndice(): Promise<IndiceProcessos> {
  const r = await fetch(`${BASE}/indice_processos.json`)
  if (!r.ok) throw new Error(`indice_processos.json: HTTP ${r.status}`)
  return construirIndice((await r.json()) as RegistroIndice[])
}
