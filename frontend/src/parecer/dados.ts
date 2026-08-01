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
  fundo: '#FAF8F2',
  painel: '#FFFDF8',
  branco: '#FFFFFF',
  tinta: '#22201C',
  terra: '#6E4B2A',
  terraClara: '#8A6234',
  verde: '#4A5E36',
  vermelho: '#8C3A2B',
  linha: '#DFDACD',
  linhaForte: '#CBC4B4',
  linhaSuave: '#EDE8DC',
  cinza: '#6B6862',
  cinzaEscuro: '#55524C',
  cinzaClaro: '#8A8271',
  barra: '#E7E2D5',
  mar: '#E9EDF0',
  terraMapa: '#F1EEE6',
  bordaMapa: '#C9C2B2',
} as const

export const SERIF = "'Source Serif 4', Georgia, serif"
export const MONO = "'IBM Plex Mono', monospace"

// ---------------------------------------------------------------------------
// Enquadramentos do mapa — [oeste, sul, leste, norte]
// ---------------------------------------------------------------------------

export type Caixa = [number, number, number, number]

export const CAIXA_BRASIL: Caixa = [-74.0, -33.8, -34.8, 5.3]
export const CAIXA_BAHIA: Caixa = [-46.7, -18.4, -37.3, -8.5]

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
 * ⚠️ NÃO CONFERIDO. Telefones institucionais de referência, sem consulta
 * registrada à fonte primária. A tela é obrigada a marcar isso — mesma regra
 * de `Fundamento.verificado` (C.6).
 */
export const TELEFONES: Record<string, string> = {
  'INEMA — Licenciamento': '(71) 3118-4000',
  'INEMA — Florestas e Biodiversidade': '(71) 3118-4270',
  'INEMA — Recursos Hídricos': '(71) 3118-4144',
  'IBAMA — Superintendência na Bahia': '(71) 3117-1000',
  'Exército — SFPC/6': '(71) 3202-2000',
  'ANM — Gerência Regional na Bahia': '(71) 3271-8600',
  'IPHAN — Superintendência na Bahia': '(71) 3324-1400',
  'SEMA-BA — Gestão Ambiental Compartilhada': '(71) 3115-6300',
}

export const telefoneDe = (orgao: string): string => TELEFONES[orgao] ?? '—'

export const linkTel = (telefone: string) => `tel:+55${telefone.replace(/\D/g, '')}`

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const NF2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const fmt = (n: number) => NF.format(Number(n) || 0)
export const fmt2 = (n: number) => NF2.format(Number(n) || 0)

export const pct = (p: number) => `${NF2.format(p * 100)}%`
