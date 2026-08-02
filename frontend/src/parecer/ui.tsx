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
    background: CORES.carvao,
    color: CORES.branco,
    border: 'none',
    height: 54,
    padding: '0 26px',
    fontSize: 16,
    borderRadius: 6,
  } satisfies CSSProperties,
  secundario: {
    background: CORES.linhaSuave,
    color: CORES.tinta,
    border: `1px solid ${CORES.linhaForte}`,
    height: 54,
    padding: '0 26px',
    fontSize: 16,
    borderRadius: 6,
  } satisfies CSSProperties,
  escuro: {
    background: CORES.carvaoForte,
    color: CORES.branco,
    border: 'none',
    height: 54,
    padding: '0 26px',
    fontSize: 16,
    borderRadius: 6,
  } satisfies CSSProperties,
  campoTexto: {
    height: 56,
    padding: '0 16px',
    background: CORES.branco,
    border: `1px solid ${CORES.linhaForte}`,
    fontSize: 19,
    fontVariantNumeric: 'tabular-nums',
    borderRadius: 6,
  } satisfies CSSProperties,
  select: {
    width: '100%',
    height: 56,
    padding: '0 14px',
    background: CORES.branco,
    border: `1px solid ${CORES.linhaForte}`,
    fontSize: 18,
    borderRadius: 6,
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
    background: ativo ? CORES.carvao : CORES.linhaSuave,
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
        borderRadius: 4,
        overflow: 'hidden',
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
export function Pendente({
  texto = 'a conferir',
  cor = CORES.terraClara,
  corBorda = '#D8C09A',
}: {
  texto?: string
  cor?: string
  corBorda?: string
}) {
  return (
    <span
      style={{
        fontSize: 11,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: cor,
        border: `1px solid ${corBorda}`,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
        borderRadius: 4,
      }}
    >
      {texto}
    </span>
  )
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor: string }) {
  return <div style={{ ...s.etiqueta, color: cor }}>{children}</div>
}

/**
 * Pendência do formulário (B.7). A mensagem sempre diz o que fazer e por quê —
 * nunca "campo obrigatório". Não bloqueia nada: o motor devolve INDETERMINADO
 * com o fato nomeado, e este aviso é o par visível dessa lacuna no formulário.
 */
export function Aviso({
  children,
  erro = false,
  fundoEscuro = false,
}: {
  children: ReactNode
  erro?: boolean
  /** Em cartão escuro (ex. tipologia) o cinza de texto some no fundo. */
  fundoEscuro?: boolean
}) {
  const corTexto = erro
    ? fundoEscuro
      ? '#E89B8A'
      : CORES.vermelho
    : fundoEscuro
      ? 'rgba(255,255,255,0.72)'
      : CORES.cinzaEscuro
  const corMarca = erro ? corTexto : fundoEscuro ? '#D8C09A' : CORES.terraClara
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 8,
        marginTop: 10,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: corTexto,
        maxWidth: 560,
      }}
    >
      <span aria-hidden style={{ flex: 'none', color: corMarca }}>
        {erro ? '!' : '→'}
      </span>
      <span>{children}</span>
    </div>
  )
}
