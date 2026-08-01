/**
 * ESCOPO B.4 — funções de porte.
 *
 * As faixas da CEPRAM são função degrau, não curva contínua: [min, max), com
 * `max: null` no topo. Tudo aqui deriva de `Tipologia.faixas` — nenhuma
 * fronteira é constante neste arquivo, porque C.1 ainda vai trocar os números
 * e o controle deslizante precisa se recalibrar sozinho quando isso acontecer.
 */

import type { FaixaPorte, FaixaTipologia, Tipologia } from '@/lib/schemas'

/** Faixa em que um valor cai. `null` quando o valor está fora de toda faixa. */
export function faixaDe(tipologia: Tipologia, valor: number): FaixaPorte | null {
  for (const f of tipologia.faixas) {
    if (valor >= f.min && (f.max === null || valor < f.max)) return f.faixa
  }
  return null
}

/** A linha da faixa, e não só o rótulo — o marcador de E.3 precisa dos limites. */
export function linhaFaixa(
  tipologia: Tipologia,
  valor: number,
): FaixaTipologia | null {
  return (
    tipologia.faixas.find(
      (f) => valor >= f.min && (f.max === null || valor < f.max),
    ) ?? null
  )
}

/**
 * Fronteiras internas das faixas, em ordem crescente. É exatamente sobre elas
 * que D.4 reavalia o motor — varredura contínua seria desperdício.
 */
export function fronteiras(tipologia: Tipologia): number[] {
  const out = tipologia.faixas.map((f) => f.min).filter((m) => m > 0)
  return [...new Set(out)].sort((a, b) => a - b)
}

/**
 * Topo útil do controle deslizante. A última faixa é ilimitada; arrastar até
 * o infinito não é possível, então o slider vai até o dobro da fronteira mais
 * alta — o suficiente para o usuário ver que passou para "excepcional".
 */
export function tetoSlider(tipologia: Tipologia): number {
  const fs = fronteiras(tipologia)
  const ultima = fs.at(-1)
  return ultima ? ultima * 2 : 1000
}

/**
 * Escala logarítmica. As faixas cobrem de 10³ a 10⁶ na mesma tipologia; em
 * escala linear as três primeiras ficariam espremidas nos primeiros pixels e o
 * controle seria inutilizável para micro e pequeno porte.
 *
 * `log10(1 + v)` em vez de `log10(v)` para que zero seja representável.
 */
export const PASSOS_SLIDER = 1000

export function valorParaPosicao(valor: number, teto: number): number {
  const v = Math.max(0, Math.min(valor, teto))
  const p = Math.log10(1 + v) / Math.log10(1 + teto)
  return Math.round(p * PASSOS_SLIDER)
}

export function posicaoParaValor(posicao: number, teto: number): number {
  const p = Math.max(0, Math.min(posicao, PASSOS_SLIDER)) / PASSOS_SLIDER
  const v = 10 ** (p * Math.log10(1 + teto)) - 1
  return arredondarSignificativo(v)
}

/**
 * Arredonda para um número que uma pessoa digitaria. Arrastar o controle e ler
 * "47.318,4 t/ano" é ruído; "47.000" é a mesma informação sem o ruído.
 */
function arredondarSignificativo(v: number): number {
  if (v <= 0) return 0
  const ordem = Math.floor(Math.log10(v))
  const passo = 10 ** Math.max(0, ordem - 2)
  return Math.round(v / passo) * passo
}

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** Número com unidade. Nunca se exibe número de porte sem unidade (DoD). */
export function formatarPorte(valor: number, unidade: string): string {
  return `${NF.format(valor)} ${unidade}`
}

export const ROTULO_FAIXA: Record<FaixaPorte, string> = {
  micro: 'Microporte',
  pequeno: 'Pequeno porte',
  medio: 'Médio porte',
  grande: 'Grande porte',
  excepcional: 'Porte excepcional',
}
