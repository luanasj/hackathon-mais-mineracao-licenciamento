/**
 * ESCOPO B.7 — validação.
 *
 * Duas regras de método:
 *
 * 1. **Toda mensagem diz o que fazer.** Zero "campo inválido", zero "campo
 *    obrigatório". A mensagem nomeia o campo, a unidade e a consequência.
 *
 * 2. **Pendência não bloqueia a avaliação.** Faltar um campo não trava o botão:
 *    faz o motor devolver INDETERMINADO com o fato faltante nomeado, que é o
 *    comportamento do produto (D.5), não um erro de formulário. Por isso o tipo
 *    abaixo tem `severidade`, e não `bloqueia`.
 */

import type { EstadoFormulario } from '@/state/tipos'
import type { Tipologia } from '@/lib/schemas'

export type CampoFormulario =
  | 'area'
  | 'tipologia'
  | 'substancia'
  | 'fase'
  | 'porte'
  | 'supressao_ha'

export interface Pendencia {
  campo: CampoFormulario
  /** `falta` = ainda não respondido · `erro` = respondido de forma impossível. */
  severidade: 'falta' | 'erro'
  mensagem: string
}

export function validar(
  estado: EstadoFormulario,
  tipologia: Tipologia | null,
): Pendencia[] {
  const out: Pendencia[] = []

  if (estado.origem === 'nenhuma') {
    out.push({
      campo: 'area',
      severidade: 'falta',
      mensagem:
        'Busque o processo ANM ou desenhe a poligonal no mapa — sem área não há município, e sem município não há competência.',
    })
  }

  if (!tipologia) {
    out.push({
      campo: 'tipologia',
      severidade: 'falta',
      mensagem:
        'Escolha a tipologia licenciável. É ela que define o parâmetro de porte e as faixas da Resolução CEPRAM 4.420/2015.',
    })
  }

  if (!estado.substancia.trim()) {
    out.push({
      campo: 'substancia',
      severidade: 'falta',
      mensagem:
        'Informe a substância mineral. Substâncias nucleares atraem a competência federal, independentemente do porte.',
    })
  }

  if (!estado.fase.trim()) {
    out.push({
      campo: 'fase',
      severidade: 'falta',
      mensagem:
        'Informe a fase do processo na ANM. O regime de licenciamento da Lei 6.567/1978 é gatilho de competência local.',
    })
  }

  if (tipologia) {
    if (estado.porte_valor === null) {
      out.push({
        campo: 'porte',
        severidade: 'falta',
        mensagem: `Informe ${tipologia.parametro_porte} em ${tipologia.unidade_porte}. O porte decide em qual faixa a atividade cai e, com ela, a instância competente.`,
      })
    } else if (estado.porte_valor < 0) {
      out.push({
        campo: 'porte',
        severidade: 'erro',
        mensagem: `${maiuscula(tipologia.parametro_porte)} não pode ser negativa. Informe um valor em ${tipologia.unidade_porte} maior ou igual a zero.`,
      })
    }
  }

  const c = estado.condicionais
  const ativos = tipologia?.campos_condicionais ?? []
  if (
    ativos.includes('supressao_vegetacao') &&
    c.supressao_vegetacao === true &&
    (c.supressao_ha === null || c.supressao_ha <= 0)
  ) {
    out.push({
      campo: 'supressao_ha',
      severidade: 'falta',
      mensagem:
        'Informe a área de supressão em hectares — é ela que dispara a exigência de Autorização de Supressão de Vegetação (ASV).',
    })
  }

  return out
}

export function pendenciaDe(
  pendencias: Pendencia[],
  campo: CampoFormulario,
): Pendencia | undefined {
  return pendencias.find((p) => p.campo === campo)
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
