/**
 * Tela inicial — o estado vazio, antes de existir área.
 *
 * Só duas entradas, porque só existem dois caminhos: o número do processo na
 * ANM, ou a poligonal desenhada. Tudo o mais — cadastro, tipologia, porte,
 * condicionais, parecer — é consequência de um dos dois e só aparece depois
 * que um deles resolve. Mostrar aqueles campos aqui seria pedir caracterização
 * de uma área que ainda não existe.
 *
 * Os dois caminhos convergem no mesmo lugar: `selecionar-processo` chega com
 * substância e fase do SIGMINE, `selecionar-area` chega com eles em branco.
 * A tela seguinte é a mesma nos dois casos.
 */

import { useRef } from 'react'

import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'

import BuscaProcesso from './BuscaProcesso'
import MapaDesenho from './MapaDesenho'
import type { ResultadoDesenho } from './MapaDesenho'
import { CORES, SERIF } from './dados'

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
  const mapaRef = useRef<HTMLDivElement | null>(null)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: `2px solid ${CORES.terra}`,
          background: CORES.branco,
          padding: 'clamp(24px, 6vw, 48px) clamp(20px, 6vw, 20px)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 13,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: CORES.terraClara,
            }}
          >
            licenciamento ambiental · mineração · Bahia
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(30px, 7vw, 52px)',
              lineHeight: 1.05,
              fontWeight: 400,
              margin: '14px 0 0',
              textWrap: 'pretty',
            }}
          >
            Quem licencia esta operação
          </h1>
          <p
            style={{
              fontSize: 'clamp(16px, 2.4vw, 19px)',
              lineHeight: 1.55,
              color: CORES.cinzaEscuro,
              maxWidth: 680,
              margin: '16px 0 0',
              textWrap: 'pretty',
            }}
          >
            Diga qual é a área. A partir dela a tela deriva os municípios atingidos, a faixa de
            porte e a competência — prefeitura, INEMA ou IBAMA — com o dispositivo legal de cada
            passo.
          </p>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          padding: 'clamp(28px, 6vw, 56px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 96px)',
        }}
      >
        <div className="ti-grid" style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Caminho 1 — o número. */}
          <section>
            <BuscaProcesso
              indice={indice}
              erroIndice={erroIndice}
              selecionado={null}
              onSelecionar={onSelecionar}
              onDesenhar={() => mapaRef.current?.scrollIntoView({ behavior: 'smooth' })}
            />
          </section>

          {/* Caminho 2 — o desenho. Concluir aqui equivale a informar o número:
              a mesma tela de caracterização abre, só que sem nada preenchido. */}
          <section className="ti-col-mapa" ref={mapaRef}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: CORES.cinzaClaro,
                marginBottom: 6,
              }}
            >
              ou
            </div>
            <div style={{ fontSize: 15, color: CORES.terra, marginBottom: 12 }}>
              Área sem processo na ANM
            </div>
            <MapaDesenho
              altura="clamp(360px, 60vh, 600px)"
              rotuloConcluir="Usar esta área"
              onConcluir={onConcluirDesenho}
            />
          </section>
        </div>
      </main>
    </div>
  )
}
