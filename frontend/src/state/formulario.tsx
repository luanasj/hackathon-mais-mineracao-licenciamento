/**
 * ESCOPO B.6 — estado global único.
 *
 * Critério de aceite: mudança em qualquer campo propaga sem recarregar, e o
 * formulário e a tela de parecer leem a MESMA fonte. Por isso o parecer não é
 * estado: é `useMemo` derivado dos fatos. Não existe caminho em que a tela de
 * parecer mostre algo que o formulário não esteja dizendo.
 *
 * Context + useReducer, zero dependência nova.
 *
 * O `parecer` (competência) continua sendo calculado aqui, no browser, e roda
 * com a rede desligada — é o DoD original e o argumento central da demo. O
 * `ranking` (viabilidade de protocolo) é a única coisa nesta tela que sai para
 * a rede: depende de SQLite, que não existe no browser. Ele degrada sozinho
 * (`estado: 'indisponivel'`) e não pode derrubar o resto — ver `lib/api.ts`.
 */

import { createContext, use, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'

import { construirFactBase, tipologiaPorId } from '@/lib/fatos'
import { avaliar } from '@/lib/motor'
import type { FactBase, Parecer, Tipologia } from '@/lib/schemas'
import { useRanking } from '@/state/ranking'
import type { EstadoRanking } from '@/state/ranking'
import { ESTADO_INICIAL, CONDICIONAIS_VAZIAS } from '@/state/tipos'
import type { AcaoFormulario, EstadoFormulario } from '@/state/tipos'

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reducer(
  estado: EstadoFormulario,
  acao: AcaoFormulario,
): EstadoFormulario {
  switch (acao.tipo) {
    case 'selecionar-processo':
      // Selecionar processo REESCREVE substância e fase, inclusive por cima de
      // edição manual anterior: o usuário trocou de área, e manter "urânio"
      // digitado sobre um processo de granito seria mentira silenciosa.
      return {
        ...estado,
        origem: 'processo',
        processo: acao.processo,
        area: null,
        substancia: acao.processo.substancia,
        substancia_editada: false,
        fase: acao.processo.fase,
        fase_editada: false,
      }

    case 'selecionar-area':
      // Área desenhada não traz substância nem fase — o SIGMINE é que trazia.
      // Os campos ficam em branco e passam a ser obrigatórios (B.7).
      return {
        ...estado,
        origem: 'desenho',
        area: acao.area,
        processo: null,
        substancia: '',
        substancia_editada: false,
        fase: '',
        fase_editada: false,
      }

    case 'limpar-area':
      return { ...estado, origem: 'nenhuma', processo: null, area: null }

    case 'tipologia': {
      if (acao.id === estado.tipologia_id) return estado
      const nova = tipologiaPorId(acao.id)
      // Trocar de tipologia troca o parâmetro de porte e a unidade. Manter o
      // número anterior significaria ler "150.000" como t/ano numa tipologia
      // medida em hectares. O porte zera, e o controle se recalibra.
      const mantidos = camposCondicionaisMantidos(estado, nova)
      return {
        ...estado,
        tipologia_id: acao.id,
        porte_valor: null,
        condicionais: mantidos,
      }
    }

    case 'substancia':
      return { ...estado, substancia: acao.valor, substancia_editada: true }

    case 'fase':
      return { ...estado, fase: acao.valor, fase_editada: true }

    case 'porte':
      return { ...estado, porte_valor: acao.valor }

    case 'condicional':
      return {
        ...estado,
        condicionais: {
          ...estado.condicionais,
          [acao.campo]: acao.valor,
        } as EstadoFormulario['condicionais'],
      }

    case 'restaurar-sigmine': {
      const p = estado.processo
      if (!p) return estado
      return acao.campo === 'substancia'
        ? { ...estado, substancia: p.substancia, substancia_editada: false }
        : { ...estado, fase: p.fase, fase_editada: false }
    }

    case 'reiniciar':
      return ESTADO_INICIAL
  }
}

/** Respostas condicionais que a nova tipologia ainda ativa sobrevivem. */
function camposCondicionaisMantidos(
  estado: EstadoFormulario,
  nova: Tipologia | null,
): EstadoFormulario['condicionais'] {
  const ativos = nova?.campos_condicionais ?? []
  const c = estado.condicionais
  return {
    supressao_vegetacao: ativos.includes('supressao_vegetacao')
      ? c.supressao_vegetacao
      : CONDICIONAIS_VAZIAS.supressao_vegetacao,
    supressao_ha: ativos.includes('supressao_vegetacao')
      ? c.supressao_ha
      : CONDICIONAIS_VAZIAS.supressao_ha,
    recurso_hidrico: ativos.includes('recurso_hidrico')
      ? c.recurso_hidrico
      : [],
    explosivos: ativos.includes('explosivos')
      ? c.explosivos
      : CONDICIONAIS_VAZIAS.explosivos,
  }
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface ContextoFormulario {
  estado: EstadoFormulario
  despachar: (acao: AcaoFormulario) => void
  /** Tipologia escolhida, já resolvida. */
  tipologia: Tipologia | null
  /** Os fatos que o motor recebe. Exibidos crus no painel "por quê?". */
  fatos: FactBase
  /** Saída do motor para o estado atual. Nunca é estado armazenado. */
  parecer: Parecer
  /**
   * Ranking de viabilidade, vindo do backend. `null` enquanto nada foi pedido.
   *
   * Pergunta diferente da de `parecer`: aquele diz quem TEM competência, este
   * diz onde o protocolo tem mais chance de andar. Chega por rede porque
   * depende de SQLite (licenças, consórcios, índice FTS5 dos atos) — e por isso
   * pode vir `indisponivel` sem que nada mais na tela pare.
   */
  ranking: EstadoRanking
}

const Ctx = createContext<ContextoFormulario | null>(null)

export function ProvedorFormulario({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducer, ESTADO_INICIAL)

  const derivado = useMemo(() => {
    const fatos = construirFactBase(estado)
    return { fatos, parecer: avaliar(fatos) }
  }, [estado])

  const tipologia = tipologiaPorId(estado.tipologia_id)

  const ranking = useRanking({
    processo: estado.processo?.processo ?? null,
    municipios: estado.area?.municipios ?? null,
    tipologia,
    producao: estado.porte_valor,
    substancia: estado.substancia,
  })

  const valor = useMemo<ContextoFormulario>(
    () => ({
      estado,
      despachar,
      tipologia,
      ...derivado,
      ranking,
    }),
    [estado, derivado, tipologia, ranking],
  )

  return <Ctx value={valor}>{children}</Ctx>
}

export function useFormulario(): ContextoFormulario {
  const ctx = use(Ctx)
  if (!ctx) {
    throw new Error('useFormulario precisa estar dentro de <ProvedorFormulario>')
  }
  return ctx
}
