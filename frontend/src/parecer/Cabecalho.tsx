/**
 * Barra de identidade. É a única superfície da tela em marrom cheio — todo o
 * resto é branco e cinza, e o destaque só volta a aparecer em ação primária.
 *
 * O nome da proposta ainda não está definido: `NOME_PROPOSTA` é o placeholder
 * e o único ponto a trocar quando estiver.
 */

import { CORES, RAIO } from './dados'

export const NOME_PROPOSTA = '[NOME DA PROPOSTA]'

const CONTEXTO = 'Licenciamento ambiental · mineração · Bahia'

export default function Cabecalho() {
  return (
    <header
      style={{
        background: CORES.terra,
        color: CORES.branco,
        padding: 'clamp(14px, 2.4vw, 20px) clamp(18px, 5vw, 48px)',
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              flex: 'none',
              width: 38,
              height: 38,
              borderRadius: RAIO.medio,
              background: 'rgba(255, 255, 255, .16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            ◆
          </span>
          <span
            style={{
              fontSize: 'clamp(17px, 2.4vw, 21px)',
              fontWeight: 800,
              letterSpacing: '-.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {NOME_PROPOSTA}
          </span>
        </div>

        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, .78)',
            background: 'rgba(255, 255, 255, .12)',
            borderRadius: RAIO.pilula,
            padding: '6px 14px',
          }}
        >
          {CONTEXTO}
        </span>
      </div>
    </header>
  )
}
