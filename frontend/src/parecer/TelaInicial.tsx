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
 * fica atrás de um botão, e quando aberto reparte a tela: o campo desliza para
 * a coluna da esquerda e o mapa ocupa a da direita (`.ti-split`).
 *
 * Os dois caminhos convergem no mesmo lugar: `selecionar-processo` chega com
 * substância e fase do SIGMINE, `selecionar-area` chega com eles em branco.
 * A tela seguinte é a mesma nos dois casos.
 */

import { useState } from 'react'

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
  // O mapa custa tiles e um canvas: só nasce quando pedido pela primeira vez.
  // Depois disso fica montado, para que fechar não apague a poligonal.
  const [mapaMontado, setMapaMontado] = useState(false)

  function abrirArea() {
    setAreaAberta(true)
    setMapaMontado(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <BarraMarca />

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(32px, 8vh, 80px) clamp(20px, 5vw, 48px) clamp(40px, 9vw, 88px)',
        }}
      >
        <div className="ti-split" data-aberto={areaAberta}>
          {/* Coluna 1 — o número. */}
          <div style={{ minWidth: 0 }}>
            <BuscaProcesso
              destaque
              indice={indice}
              erroIndice={erroIndice}
              selecionado={null}
              onSelecionar={onSelecionar}
              onDesenhar={() => {
                setAreaAberta(true)
                setMapaMontado(true)
              }}
            />

            {!areaAberta && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                <button
                  type="button"
                  onClick={abrirArea}
                  aria-expanded={false}
                  aria-controls="painel-area"
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

          {/* Coluna 2 — o desenho. Fica montada mesmo fechada: desmontar
              perderia a poligonal e o mapa recarregaria do zero a cada abre e
              fecha. Fechada tem largura zero, e o `aria-hidden` mantém o leitor
              de tela na mesma leitura que a vista. */}
          <div
            id="painel-area"
            className="ti-painel-area"
            aria-hidden={!areaAberta}
            style={{ minWidth: 0 }}
          >
            <div
              style={{
                padding: 'clamp(16px, 2.4vw, 24px)',
                background: CORES.branco,
                border: `1px solid ${CORES.linhaForte}`,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 15, color: CORES.terra }}>Área sem processo na ANM</div>
                <button
                  type="button"
                  className="pc-toggle"
                  onClick={() => setAreaAberta(false)}
                  aria-label="Fechar o mapa"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontSize: 14,
                    color: CORES.cinza,
                    lineHeight: 1,
                  }}
                >
                  Fechar
                </button>
              </div>
              {mapaMontado && (
                <MapaDesenho
                  altura="clamp(260px, 42vh, 420px)"
                  rotuloConcluir="Usar esta área"
                  onConcluir={onConcluirDesenho}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
