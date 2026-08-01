/**
 * ESCOPO B.6 — forma do estado do formulário.
 *
 * Este é o único lugar onde a caracterização mora. O motor NÃO lê daqui: lê do
 * `FactBase` que `lib/fatos.ts` constrói a partir deste estado (contrato D.1).
 */

import type { RegistroIndice } from '@/lib/processos'
import type { IncidenciaMunicipal } from '@/lib/schemas'

/** De onde veio a área que está sendo caracterizada. */
export type OrigemArea = 'processo' | 'desenho' | 'nenhuma'

/** Área desenhada à mão (A.9), já com os municípios derivados no cliente. */
export interface AreaManual {
  area_ha: number
  municipios: IncidenciaMunicipal[]
  cruza_divisa: boolean
}

/** Usos de recurso hídrico. Múltipla escolha — captar e lançar coexistem. */
export type UsoHidrico = 'captacao' | 'lancamento' | 'barramento'

export interface Condicionais {
  /** `null` = não respondido. Diferente de `false` (respondido "não"). */
  supressao_vegetacao: boolean | null
  /** Área de supressão em hectares. Só faz sentido com `supressao_vegetacao`. */
  supressao_ha: number | null
  recurso_hidrico: UsoHidrico[]
  explosivos: boolean | null
}

export const CONDICIONAIS_VAZIAS: Condicionais = {
  supressao_vegetacao: null,
  supressao_ha: null,
  recurso_hidrico: [],
  explosivos: null,
}

export interface EstadoFormulario {
  origem: OrigemArea
  /** Processo do SIGMINE selecionado na busca (A.5/A.6). */
  processo: RegistroIndice | null
  /** Área desenhada no mapa (A.9). Exclusiva com `processo`. */
  area: AreaManual | null

  /** ID da `Tipologia` escolhida em B.1. */
  tipologia_id: string | null

  /** B.2 — pré-preenchida pelo SIGMINE, editável. */
  substancia: string
  /** `true` quando o usuário sobrescreveu o valor que veio do SIGMINE. */
  substancia_editada: boolean

  /** B.3 — fase/regime ANM, pré-preenchido pelo SIGMINE, editável. */
  fase: string
  fase_editada: boolean

  /** B.4 — valor do parâmetro de porte, na unidade da tipologia. */
  porte_valor: number | null

  condicionais: Condicionais
}

export const ESTADO_INICIAL: EstadoFormulario = {
  origem: 'nenhuma',
  processo: null,
  area: null,
  tipologia_id: null,
  substancia: '',
  substancia_editada: false,
  fase: '',
  fase_editada: false,
  porte_valor: null,
  condicionais: CONDICIONAIS_VAZIAS,
}

export type AcaoFormulario =
  | { tipo: 'selecionar-processo'; processo: RegistroIndice }
  | { tipo: 'selecionar-area'; area: AreaManual }
  | { tipo: 'limpar-area' }
  | { tipo: 'tipologia'; id: string }
  | { tipo: 'substancia'; valor: string }
  | { tipo: 'fase'; valor: string }
  | { tipo: 'porte'; valor: number }
  | { tipo: 'condicional'; campo: keyof Condicionais; valor: unknown }
  | { tipo: 'restaurar-sigmine'; campo: 'substancia' | 'fase' }
  | { tipo: 'reiniciar' }
