/**
 * Hook do ranking de instâncias — a única parte da tela que fala com o backend.
 *
 * Fica separado de `formulario.tsx` de propósito: lá o `parecer` é derivado
 * SÍNCRONO (`useMemo`), e é isso que faz "mudar um campo e a resposta saltar"
 * funcionar sem piscar. Misturar uma chamada assíncrona naquele `useMemo`
 * arrastaria a competência para a latência da rede e para a disponibilidade do
 * backend — exatamente o que não pode acontecer.
 *
 * Aqui, portanto: estado próprio, atraso antes de disparar, e cancelamento da
 * resposta velha.
 */
import { useEffect, useRef, useState } from 'react'

import { buscarRanking } from '@/lib/api'
import type { ResultadoRanking } from '@/lib/api'
import type { IncidenciaMunicipal, Tipologia } from '@/lib/schemas'

/**
 * O slider de porte dispara uma mudança de estado por pixel arrastado. Sem
 * atraso, seria uma requisição por frame. 350 ms é abaixo do que se percebe
 * como travamento e acima da cadência do arrasto.
 */
const ATRASO_MS = 350

export interface EstadoRanking {
  resultado: ResultadoRanking | null
  carregando: boolean
}

export function useRanking(args: {
  processo: string | null
  municipios: IncidenciaMunicipal[] | null
  tipologia: Tipologia | null
  producao: number | null
  substancia: string
}): EstadoRanking {
  const { processo, municipios, tipologia, producao, substancia } = args
  const [resultado, setResultado] = useState<ResultadoRanking | null>(null)
  const [carregando, setCarregando] = useState(false)

  // Identifica a requisição em voo. Resposta de pedido que já não é o atual é
  // descartada — sem isso, uma consulta lenta pode sobrescrever o resultado de
  // uma consulta posterior e mais rápida.
  const vez = useRef(0)

  // `municipios` é array novo a cada render do provedor; comparar por
  // referência re-dispararia sempre. A chave serializa só o que a consulta usa.
  const chaveMunicipios = (municipios ?? [])
    .map((m) => `${m.cd_mun}:${m.proporcao.toFixed(4)}`)
    .join(',')

  useEffect(() => {
    const minhaVez = ++vez.current
    setCarregando(true)

    const relogio = setTimeout(() => {
      void buscarRanking({ processo, municipios, tipologia, producao, substancia }).then((r) => {
        if (vez.current !== minhaVez) return
        setResultado(r)
        setCarregando(false)
      })
    }, ATRASO_MS)

    return () => {
      clearTimeout(relogio)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processo, chaveMunicipios, tipologia?.codigo, producao, substancia])

  return { resultado, carregando }
}
