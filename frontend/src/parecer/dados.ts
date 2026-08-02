/**
 * Constantes de APRESENTAÇÃO.
 *
 * Nada de domínio mora aqui. Tipologias vêm de `@/data/fixtures` (C.1),
 * habilitação municipal idem (C.2), faixas de porte de `Tipologia.faixas`, e
 * o veredito de `@/lib/motor`. Este arquivo só sabe de cor, tipografia e
 * enquadramento de mapa.
 */

import type { Instancia, Orgao } from '@/lib/schemas'

export const CORES = {
  fundo: '#F6F5F3',
  painel: '#FBFAF9',
  branco: '#FFFFFF',
  tinta: '#22201C',
  terra: '#6E4B2A',
  terraClara: '#8A6234',
  verde: '#4A5E36',
  vermelho: '#8C3A2B',
  linha: '#DAD9D4',
  linhaForte: '#C6C4BE',
  linhaSuave: '#E9E8E3',
  cinza: '#6B6862',
  cinzaEscuro: '#55524C',
  cinzaClaro: '#86847E',
  barra: '#E3E2DD',
  mar: '#E9EDF0',
  terraMapa: '#EEEDEA',
  bordaMapa: '#C4C2BC',
  carvao: '#46443F',
  carvaoForte: '#332F2B',
} as const

export const SERIF = "'Source Serif 4', Georgia, serif"
export const MONO = "'IBM Plex Mono', monospace"

// ---------------------------------------------------------------------------
// Enquadramentos do mapa — [oeste, sul, leste, norte]
// ---------------------------------------------------------------------------

export type Caixa = [number, number, number, number]

export const CAIXA_BAHIA: Caixa = [-46.7, -18.4, -37.3, -8.5]

/**
 * Bbox coberto pelos tiles de relevo (`pipeline/relevo.py` /
 * `pipeline/relevo_cor.py`). Precisa bater com `MINX, MINY, MAXX, MAXY` de
 * lá — fora dela não existe tile, e sem declarar isso na fonte o maplibre
 * pede um PNG que não existe, o Vite devolve o `index.html` do SPA no lugar,
 * e o navegador falha ao decodificar.
 */
export const CAIXA_RELEVO: Caixa = [-45.008441, -14.5092, -38.137166, -9.740468]

// ---------------------------------------------------------------------------
// Rótulos do vocabulário do motor
// ---------------------------------------------------------------------------

export const ROTULO_INSTANCIA: Record<Instancia, string> = {
  UNIAO: 'competência federal',
  ESTADUAL: 'competência estadual',
  MUNICIPAL: 'competência municipal',
  INDETERMINADA: 'competência indeterminada',
}

/**
 * Nome de tela do órgão. `MUNICIPIO` é o único que depende de dado — quem
 * licencia é a prefeitura de um município concreto, e o rótulo tem de dizer
 * qual, senão o parecer não serve para ligar para ninguém.
 */
export function nomeOrgao(orgao: Orgao, municipio: string | null): string {
  switch (orgao) {
    case 'MUNICIPIO':
      return municipio ? `Prefeitura de ${municipio}` : 'Prefeitura do município'
    case 'INEMA':
      return 'INEMA'
    case 'IBAMA':
      return 'IBAMA'
    case 'ANM':
      return 'ANM'
    case 'INDETERMINADO':
      return 'Indeterminado'
  }
}

// ---------------------------------------------------------------------------
// Lista telefônica
// ---------------------------------------------------------------------------

export interface Contato {
  orgao: string
  telefone: string
  /** Por que este órgão está na lista deste parecer. */
  motivo: string
}

/**
 * TODO: sem tabela de contatos institucionais no schema
 * (`documentation/schema.sql`) — telefone/nome de órgão ainda não têm fonte
 * de banco. Quando existir (ex.: tabela `orgao_contato`), substituir este
 * stub por consulta real. Até lá, retorna sempre "não levantado".
 */
export const telefoneDe = (_orgao: string): string => '—'

export const linkTel = (telefone: string) => `tel:+55${telefone.replace(/\D/g, '')}`

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const NF2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const fmt = (n: number) => NF.format(Number(n) || 0)
export const fmt2 = (n: number) => NF2.format(Number(n) || 0)

export const pct = (p: number) => `${NF2.format(p * 100)}%`
