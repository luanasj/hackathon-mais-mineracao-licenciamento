/**
 * ESCOPO B.2 / B.3 / B.8 — vocabulário do domínio.
 *
 * As 14 fases abaixo são as que efetivamente ocorrem no recorte da amostra,
 * extraídas de `app/public/data/indice_processos.json` (SIGMINE/ANM). Nenhuma
 * foi inventada. Conferir com:
 *
 *     jq -r '.[].fase' app/public/data/indice_processos.json | sort -u
 *
 * As substâncias são as mais frequentes da amostra, e servem só de atalho de
 * digitação — o campo aceita qualquer texto, porque o usuário pode caracterizar
 * uma área que ainda não tem processo.
 */

/** Fases do processo minerário, por frequência no recorte. */
export const FASES_ANM = [
  'AUTORIZAÇÃO DE PESQUISA',
  'DISPONIBILIDADE',
  'REQUERIMENTO DE LAVRA',
  'APTO PARA DISPONIBILIDADE',
  'CONCESSÃO DE LAVRA',
  'LICENCIAMENTO',
  'REQUERIMENTO DE PESQUISA',
  'REQUERIMENTO DE LAVRA GARIMPEIRA',
  'REQUERIMENTO DE LICENCIAMENTO',
  'DIREITO DE REQUERER A LAVRA',
  'REGISTRO DE EXTRAÇÃO',
  'REQUERIMENTO DE REGISTRO DE EXTRAÇÃO',
  'LAVRA GARIMPEIRA',
  'RECONHECIMENTO GEOLÓGICO',
] as const

/**
 * Fases que correspondem ao regime de licenciamento da Lei 6.567/1978 — o
 * regime simplificado das substâncias de emprego imediato na construção civil,
 * e o gatilho de competência local que B.3 precisa marcar.
 */
export const FASES_REGIME_LICENCIAMENTO: readonly string[] = [
  'LICENCIAMENTO',
  'REQUERIMENTO DE LICENCIAMENTO',
]

/** Atalhos de digitação para o campo de substância. */
export const SUBSTANCIAS_FREQUENTES = [
  'MINÉRIO DE FERRO',
  'MINÉRIO DE COBRE',
  'MINÉRIO DE OURO',
  'MINÉRIO DE URÂNIO',
  'GRANITO',
  'MÁRMORE',
  'QUARTZITO',
  'AREIA',
  'CALCÁRIO',
  'MINÉRIO DE NÍQUEL',
] as const
