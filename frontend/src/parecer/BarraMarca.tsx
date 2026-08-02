/**
 * Barra de marca — a mesma em todas as telas, para que a troca da tela inicial
 * pela de caracterização não pareça troca de produto.
 */

import { CORES } from './dados'

export const NOME_SITE = 'Transparencial'

export default function BarraMarca() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: '#F4F4F2',
        borderBottom: `1px solid ${CORES.linha}`,
        color: CORES.tinta,
        padding: '11px clamp(16px, 4vw, 40px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          fontSize: 'clamp(15px, 2.2vw, 19px)',
          fontWeight: 700,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: CORES.tinta,
        }}
      >
        {NOME_SITE}
      </span>
    </header>
  )
}
