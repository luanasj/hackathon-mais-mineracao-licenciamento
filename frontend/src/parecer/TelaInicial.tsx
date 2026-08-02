/**
 * Tela inicial — o estado vazio, antes de existir área.
 *
 * Só duas entradas, porque só existem dois caminhos: o número do processo na
 * ANM, ou a poligonal desenhada. Tudo o mais — cadastro, tipologia, porte,
 * condicionais, parecer — é consequência de um dos dois e só aparece depois
 * que um deles resolve. Mostrar aqueles campos aqui seria pedir caracterização
 * de uma área que ainda não existe.
 *
 * O número é o caminho comum, e é a única coisa na tela: campo único, no meio,
 * sem nada em volta para disputar atenção. O desenho é o caminho de exceção —
 * fica atrás de um botão e só abre o mapa quando pedido.
 *
 * Os dois caminhos convergem no mesmo lugar: `selecionar-processo` chega com
 * substância e fase do SIGMINE, `selecionar-area` chega com eles em branco.
 * A tela seguinte é a mesma nos dois casos.
 */

import { useEffect, useRef, useState } from 'react'

import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'

import BarraMarca from './BarraMarca'
import BuscaProcesso from './BuscaProcesso'
import MapaDesenho from './MapaDesenho'
import type { ResultadoDesenho } from './MapaDesenho'
import { CORES } from './dados'

export interface TelaInicialProps {
  indice: IndiceProcessos | null
  erroIndice: string | null
  onSelecionar: (registro: RegistroIndice) => void
  onConcluirDesenho: (resultado: ResultadoDesenho) => void
}

export default function TelaInicial({
  indice,
  erroIndice,
  onSelecionar,
  onConcluirDesenho,
}: TelaInicialProps) {
  const [areaAberta, setAreaAberta] = useState(false)
  const mapaRef = useRef<HTMLDivElement | null>(null)

  // Abrir o mapa sem trazê-lo para o campo de visão deixaria a tela igual e o
  // clique sem resposta — o container nasce abaixo da dobra.
  useEffect(() => {
    if (areaAberta) mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [areaAberta])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <BarraMarca />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: areaAberta ? 'flex-start' : 'center',
          padding: 'clamp(40px, 10vh, 96px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 96px)',
        }}
      >
        {/* Caminho 1 — o número. */}
        <div style={{ width: '100%', maxWidth: 720 }}>
          <BuscaProcesso
            destaque
            indice={indice}
            erroIndice={erroIndice}
            selecionado={null}
            onSelecionar={onSelecionar}
            onDesenhar={() => setAreaAberta(true)}
          />

          {/* Caminho 2 — o desenho. Fechado, é uma linha; aberto, é o mesmo
              bloco de mapa de sempre. */}
          {!areaAberta && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
              <button
                type="button"
                onClick={() => setAreaAberta(true)}
                style={{
                  height: 52,
                  padding: '0 26px',
                  background: 'transparent',
                  border: `1px solid ${CORES.linhaForte}`,
                  color: CORES.tinta,
                  fontSize: 16,
                  borderRadius: 8,
                }}
              >
                Selecionar área
              </button>
            </div>
          )}
        </div>

        {areaAberta && (
          <div
            ref={mapaRef}
            style={{
              width: '100%',
              maxWidth: 1080,
              marginTop: 40,
              padding: 'clamp(18px, 3vw, 28px)',
              background: CORES.branco,
              border: `1px solid ${CORES.linhaForte}`,
              borderRadius: 12,
              animation: 'vfade 200ms ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 15, color: CORES.terra }}>Área sem processo na ANM</div>
              <button
                type="button"
                className="pc-toggle"
                onClick={() => setAreaAberta(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: 14,
                  color: CORES.cinza,
                }}
              >
                Fechar
              </button>
            </div>

            <MapaDesenho
              altura="clamp(360px, 60vh, 600px)"
              rotuloConcluir="Usar esta área"
              onConcluir={onConcluirDesenho}
            />
          </div>
        )}
      </main>
    </div>
  )
}
