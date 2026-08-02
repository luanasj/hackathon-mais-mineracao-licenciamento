/**
 * Primitivas visuais compartilhadas pela tela. Estilo inline, como o resto do
 * `parecer/` — a linguagem visual é a do protótipo, não a de um framework.
 */

import type { CSSProperties, ReactNode } from 'react'

import { CORES, MONO, SERIF } from './dados'

export const s = {
  rotuloCampo: { display: 'block', fontSize: 15, color: CORES.terra } satisfies CSSProperties,
  etiqueta: {
    fontSize: 13,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
  } satisfies CSSProperties,
  titulo: {
    fontFamily: SERIF,
    fontSize: 'clamp(28px, 6vw, 46px)',
    lineHeight: 1.05,
  } satisfies CSSProperties,
  primario: {
    background: CORES.verde,
    color: CORES.branco,
    border: 'none',
    height: 54,
    padding: '0 26px',
    fontSize: 16,
  } satisfies CSSProperties,
  campoTexto: {
    height: 56,
    padding: '0 16px',
    background: CORES.branco,
    border: `1px solid ${CORES.linhaForte}`,
    fontSize: 19,
    fontVariantNumeric: 'tabular-nums',
  } satisfies CSSProperties,
  select: {
    width: '100%',
    height: 56,
    padding: '0 14px',
    background: CORES.branco,
    border: `1px solid ${CORES.linhaForte}`,
    fontSize: 18,
  } satisfies CSSProperties,
  fade: { animation: 'vfade 200ms ease' } satisfies CSSProperties,
  mono: { fontFamily: MONO, fontSize: 13, color: CORES.cinza } satisfies CSSProperties,
  secao: { fontFamily: SERIF, fontSize: 24, color: CORES.terra } satisfies CSSProperties,
}

export function estiloSegmento(ativo: boolean, primeiro: boolean, alto = true): CSSProperties {
  return {
    height: alto ? 50 : 44,
    minWidth: alto ? 110 : 96,
    padding: alto ? '0 20px' : '0 18px',
    border: 'none',
    borderLeft: primeiro ? 'none' : `1px solid ${CORES.linhaForte}`,
    background: ativo ? CORES.verde : 'transparent',
    color: ativo ? CORES.branco : CORES.tinta,
    fontSize: alto ? 16 : 15,
  }
}

export function GrupoSegmentado({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        border: `1px solid ${CORES.linhaForte}`,
        width: 'fit-content',
        maxWidth: '100%',
        background: CORES.branco,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Marca de pendência. É o contrato de honestidade do projeto na tela: nada que
 * não foi conferido contra a fonte primária aparece sem esta etiqueta (C.6).
 */
export function Pendente({ texto = 'a conferir' }: { texto?: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: CORES.terraClara,
        border: '1px solid #D8C09A',
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  )
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor: string }) {
  return <div style={{ ...s.etiqueta, color: cor }}>{children}</div>
}

/** Bloco recolhível do painel direito. Um `aberto` por vez, controlado fora. */
export function Recolhivel({
  titulo,
  contador,
  aberto,
  aoAlternar,
  children,
}: {
  titulo: string
  contador?: string
  aberto: boolean
  aoAlternar: () => void
  children: ReactNode
}) {
  return (
    <div style={{ borderBottom: `1px solid ${CORES.linha}` }}>
      <button
        type="button"
        className="pc-toggle"
        onClick={aoAlternar}
        aria-expanded={aberto}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '26px 0',
          textAlign: 'left',
        }}
      >
        <span style={s.secao}>{titulo}</span>
        {contador && <span style={{ fontSize: 14, color: CORES.cinza }}>{contador}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 14, color: CORES.verde }}>
          {aberto ? 'fechar' : 'abrir'}
        </span>
      </button>
      {aberto && <div style={{ paddingBottom: 22 }}>{children}</div>}
    </div>
  )
}

/** Linha rótulo → valor, o par que o painel direito repete o tempo todo. */
export function Linha({
  rotulo,
  valor,
  children,
}: {
  rotulo: string
  valor?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 20,
        padding: '16px 0',
        borderBottom: `1px solid ${CORES.linha}`,
      }}
    >
      <span style={{ fontSize: 15, color: CORES.cinza }}>{rotulo}</span>
      <span style={{ fontSize: 16, textAlign: 'right' }}>{valor ?? children}</span>
    </div>
  )
}
