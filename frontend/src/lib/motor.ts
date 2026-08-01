/**
 * ESCOPO D — motor de match. ⚠️ IMPLEMENTAÇÃO PROVISÓRIA.
 *
 * A ASSINATURA é definitiva; o CORPO é descartável. Quem assumir o Escopo D
 * reescreve o interior de `avaliar` e apaga a marca `STUB_D` — nenhum arquivo
 * do Escopo B precisa mudar, porque B fala com o motor só por `FactBase` in,
 * `Parecer` out.
 *
 * O que já está aqui, e é reaproveitável:
 *   D.2 — avaliador de predicados, os 7 operadores do schema
 *   D.3 — resolução por precedência, com fatores concorrentes preservados
 *   D.4 — varredura das fronteiras de faixa para achar o limiar de virada
 *   D.5 — os três estados, com ausência de fato virando INDETERMINADO
 *   D.6 — rastro de execução predicado a predicado
 *
 * O que NÃO está: trilhas e prazos (C.5), anuências (C.7), matriz de opções
 * (E.4). Esses campos saem vazios, e a interface tem de aguentar isso.
 */

import { REGRAS } from '@/data/fixtures'
import { rotuloFato, tipologiaPorId } from '@/lib/fatos'
import { fronteiras, linhaFaixa } from '@/lib/porte'
import type {
  Alerta,
  FactBase,
  FatorConcorrente,
  Fundamento,
  Instancia,
  LimiarVirada,
  Orgao,
  Parecer,
  PassoRastro,
  Predicado,
  Regra,
  Tipologia,
  ValorFato,
} from '@/lib/schemas'
import { PRECEDENCIA } from '@/lib/schemas'

/** Marca para varrer o repo quando D real entrar. */
export const STUB_D = 'PROVISORIO-D' as const

// ---------------------------------------------------------------------------
// D.2 — avaliador de predicados
// ---------------------------------------------------------------------------

function valorDe(fatos: FactBase, chave: string): ValorFato | undefined {
  return fatos[chave]?.valor
}

function comparavel(v: ValorFato | undefined): number | null {
  return typeof v === 'number' ? v : null
}

/**
 * Um predicado sobre o FactBase. Fato ausente devolve `false` sem exceção —
 * quem transforma ausência em INDETERMINADO é `exige_fato`, não o operador.
 */
export function avaliarPredicado(
  p: Predicado,
  fatos: FactBase,
): { resultado: boolean; valor_observado: ValorFato } {
  const bruto = valorDe(fatos, p.fato)
  const observado: ValorFato = bruto === undefined ? null : bruto
  let r = false

  switch (p.operador) {
    case 'existe':
      r = bruto !== undefined && bruto !== null && bruto !== ''
      break

    case 'igual':
      r = Array.isArray(observado)
        ? JSON.stringify(observado) === JSON.stringify(p.valor)
        : observado === p.valor
      break

    case 'em': {
      const conjunto = Array.isArray(p.valor) ? (p.valor as ValorFato[]) : []
      r = conjunto.some((v) => v === observado)
      break
    }

    case 'contem': {
      // Duas leituras legítimas: lista que contém item, e texto que contém
      // trecho. A segunda é insensível a caixa e acento — "urânio" tem de
      // casar com "MINÉRIO DE URÂNIO" sem que a regra precise saber a grafia.
      if (Array.isArray(observado)) {
        r = observado.some((v) => dobrar(String(v)) === dobrar(String(p.valor)))
      } else if (typeof observado === 'string') {
        r = dobrar(observado).includes(dobrar(String(p.valor)))
      }
      break
    }

    case 'maior': {
      const a = comparavel(observado)
      const b = comparavel(p.valor as ValorFato)
      r = a !== null && b !== null && a > b
      break
    }

    case 'menor': {
      const a = comparavel(observado)
      const b = comparavel(p.valor as ValorFato)
      r = a !== null && b !== null && a < b
      break
    }

    case 'entre': {
      const a = comparavel(observado)
      const par = p.valor as [number, number] | undefined
      // Intervalo fechado embaixo, aberto em cima — mesma convenção das faixas
      // de porte do schema, para que as duas coisas não divirjam.
      r = a !== null && Array.isArray(par) && a >= par[0] && a < par[1]
      break
    }
  }

  return { resultado: p.negado ? !r : r, valor_observado: observado }
}

function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ---------------------------------------------------------------------------
// Execução de uma regra
// ---------------------------------------------------------------------------

interface Disparo {
  regra: Regra
  passo: PassoRastro
  disparou: boolean
  /** Fatos que a regra exigia e não encontrou. */
  lacunas: string[]
}

function faltando(fatos: FactBase, chave: string): boolean {
  const v = valorDe(fatos, chave)
  return v === undefined || v === null || v === ''
}

function executar(regra: Regra, fatos: FactBase, ordem: number): Disparo {
  const avaliacoes = regra.condicoes.map((predicado) => {
    const { resultado, valor_observado } = avaliarPredicado(predicado, fatos)
    return { predicado, valor_observado, resultado }
  })

  // Conjunção: todas as condições. Disjunção se escreve como duas regras — é
  // deliberado, para que cada caminho apareça separado no rastro (schema).
  const todas = avaliacoes.every((a) => a.resultado)
  const lacunas = (regra.exige_fato ?? []).filter((c) => faltando(fatos, c))

  return {
    regra,
    disparou: todas && lacunas.length === 0,
    lacunas: todas ? lacunas : [],
    passo: {
      ordem,
      regra_id: regra.id,
      descricao: regra.descricao,
      disparou: todas && lacunas.length === 0,
      avaliacoes,
      fundamento: regra.fundamento,
    },
  }
}

// ---------------------------------------------------------------------------
// D.3 — resolução por precedência
// ---------------------------------------------------------------------------

function precedenciaDe(r: Regra): number {
  return r.efeito.precedencia ?? PRECEDENCIA[r.efeito.instancia]
}

interface Resolucao {
  vencedora: Regra | null
  disparos: Disparo[]
}

function resolver(fatos: FactBase, regras: readonly Regra[]): Resolucao {
  const disparos = regras.map((r, i) => executar(r, fatos, i + 1))
  const vencedora =
    disparos
      .filter((d) => d.disparou)
      .sort((a, b) => precedenciaDe(b.regra) - precedenciaDe(a.regra))[0]
      ?.regra ?? null
  return { vencedora, disparos }
}

// ---------------------------------------------------------------------------
// D.4 — detecção do limiar de virada
// ---------------------------------------------------------------------------

/**
 * As faixas da CEPRAM são função degrau com 4 ou 5 fronteiras por tipologia.
 * Busca binária sobre um contínuo seria desperdício: basta reavaliar o motor
 * imediatamente abaixo e imediatamente acima de cada fronteira e registrar
 * onde a instância competente muda.
 *
 * Custo: 2 × nº de fronteiras avaliações — nada, para 12 regras.
 */
export function detectarLimiares(
  fatos: FactBase,
  tipologia: Tipologia,
  regras: readonly Regra[] = REGRAS,
): LimiarVirada[] {
  const out: LimiarVirada[] = []

  for (const fronteira of fronteiras(tipologia)) {
    const abaixo = Math.max(0, fronteira - 1)
    const acima = fronteira

    const fAbaixo = comPorte(fatos, tipologia, abaixo)
    const fAcima = comPorte(fatos, tipologia, acima)

    const rAbaixo = resolver(fAbaixo, regras)
    const rAcima = resolver(fAcima, regras)

    const iAbaixo = rAbaixo.vencedora?.efeito.instancia ?? 'INDETERMINADA'
    const iAcima = rAcima.vencedora?.efeito.instancia ?? 'INDETERMINADA'
    if (iAbaixo === iAcima) continue

    out.push({
      valor: fronteira,
      unidade: tipologia.unidade_porte,
      faixa_abaixo: linhaFaixa(tipologia, abaixo)?.faixa ?? 'micro',
      faixa_acima: linhaFaixa(tipologia, acima)?.faixa ?? 'excepcional',
      instancia_abaixo: iAbaixo,
      instancia_acima: iAcima,
      // O limiar não é uma norma própria: ele é a fronteira de faixa da
      // tipologia. O fundamento é o da tipologia que a define.
      fundamento: tipologia.fundamento,
    })
  }

  return out
}

/** Cópia do FactBase com o porte trocado. Não muta a original. */
function comPorte(fatos: FactBase, tipologia: Tipologia, valor: number): FactBase {
  const faixa = linhaFaixa(tipologia, valor)?.faixa ?? null
  return {
    ...fatos,
    porte_valor: { chave: 'porte_valor', valor, origem: 'declarado' },
    faixa_porte: { chave: 'faixa_porte', valor: faixa, origem: 'derivado' },
  }
}

// ---------------------------------------------------------------------------
// D.7 — saída canônica
// ---------------------------------------------------------------------------

export interface OpcoesAvaliacao {
  /** Base de regras. Trocável para a suíte D.8 não depender das fixtures. */
  regras?: readonly Regra[]
}

/**
 * Entrada: fatos. Saída: parecer. Nada mais atravessa esta fronteira.
 */
export function avaliar(fatos: FactBase, opts: OpcoesAvaliacao = {}): Parecer {
  const regras = opts.regras ?? REGRAS
  const { vencedora, disparos } = resolver(fatos, regras)

  const instancia: Instancia = vencedora?.efeito.instancia ?? 'INDETERMINADA'
  const orgao: Orgao = vencedora?.efeito.orgao ?? 'INDETERMINADO'

  // D.3 — quem disparou e perdeu não some: vira fator concorrente, porque a
  // banca vai perguntar "e a regra tal?" e a resposta precisa estar na tela.
  const fatores_concorrentes: FatorConcorrente[] = disparos
    .filter((d) => d.disparou && d.regra.id !== vencedora?.id)
    .map((d) => ({
      regra_id: d.regra.id,
      descricao: d.regra.descricao,
      instancia: d.regra.efeito.instancia,
      precedencia: precedenciaDe(d.regra),
      fundamento: d.regra.fundamento,
    }))

  const alertas: Alerta[] = disparos
    .filter((d) => d.disparou)
    .flatMap((d) =>
      (d.regra.efeito.alertas ?? []).map((a) => ({ ...a, origem_regra: d.regra.id })),
    )

  const fatos_faltantes = levantarLacunas(fatos, disparos, instancia)

  // D.5 — os três estados. A ordem importa: falta de fato vence tudo, porque
  // concluir sem fato suficiente é exatamente o que o produto se recusa a fazer.
  let estado: Parecer['estado']
  if (!vencedora || instancia === 'INDETERMINADA' || fatos_faltantes.length > 0) {
    estado = 'INDETERMINADO'
  } else if (vencedora.torna_condicional) {
    estado = 'CONDICIONAL'
  } else {
    estado = 'DEFINIDA'
  }

  const tip = tipologiaPorId(String(valorDe(fatos, 'tipologia_id') ?? '') || null)
  const limiares = tip ? detectarLimiares(fatos, tip, regras) : []

  const rastro = disparos.map((d) => d.passo)
  const tem_fundamento_pendente = disparos
    .filter((d) => d.disparou)
    .some((d) => !d.regra.fundamento.verificado)

  return {
    schema_versao: '1.0.0',
    gerado_em: new Date().toISOString(),
    estado,
    instancia: estado === 'INDETERMINADO' ? 'INDETERMINADA' : instancia,
    orgao: estado === 'INDETERMINADO' ? 'INDETERMINADO' : orgao,
    fatos,
    // 🚧 C.5 ainda não entregou as trilhas; sem elas não há prazo a somar, e
    // inventar prazo é exatamente a trava de honestidade do backlog.
    trilha_selecionada: null,
    opcoes: [],
    prazo_legal_total_dias: null,
    n_licencas: null,
    anuencias: [],
    alertas,
    fatores_concorrentes,
    rastro,
    limiares,
    fatos_faltantes,
    tem_fundamento_pendente:
      tem_fundamento_pendente || (tip ? !tip.fundamento.verificado : false),
  }
}

/**
 * O que faltou para concluir. Duas fontes: os `exige_fato` das regras que
 * chegaram perto de disparar, e os municípios sem evidência de habilitação —
 * que é a lacuna que o gerador de pedido LAI (G.1) sabe endereçar.
 *
 * A lacuna só conta se for relevante para a conclusão. Competência federal
 * absorve tudo abaixo: num processo de urânio, não saber se o município está
 * habilitado não impede nada — e devolver INDETERMINADO ali seria o motor
 * fingindo dúvida sobre uma questão que a precedência já resolveu.
 */
function levantarLacunas(
  fatos: FactBase,
  disparos: Disparo[],
  instancia: Instancia,
): Parecer['fatos_faltantes'] {
  const out: Parecer['fatos_faltantes'] = []
  const vistos = new Set<string>()

  for (const d of disparos) {
    for (const chave of d.lacunas) {
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push({ chave, rotulo: rotuloFato(chave) })
    }
  }

  const semEvidencia = valorDe(fatos, 'municipios_sem_evidencia')
  if (instancia !== 'UNIAO' && Array.isArray(semEvidencia) && semEvidencia.length > 0) {
    for (const nome of semEvidencia) {
      const chave = `habilitacao:${nome}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push({
        chave,
        rotulo: `Habilitação de ${nome} para gestão ambiental compartilhada, e tipologias delegadas`,
        destinatario_sugerido:
          'Secretaria do Meio Ambiente do Estado da Bahia (SEMA-BA) — Coordenação de Gestão Ambiental Compartilhada',
      })
    }
  }

  return out
}

/** Fundamentos únicos da cadeia que decidiu, para o painel "por quê?" (F.3). */
export function fundamentosDoParecer(p: Parecer): Fundamento[] {
  const out: Fundamento[] = []
  const vistos = new Set<string>()
  for (const passo of p.rastro) {
    if (!passo.disparou) continue
    const chave = `${passo.fundamento.norma}|${passo.fundamento.dispositivo}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    out.push(passo.fundamento)
  }
  return out
}
