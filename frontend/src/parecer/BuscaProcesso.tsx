/**
 * ESCOPO A.5 / A.6 — busca do processo minerário.
 *
 * Aceita `870123/2019`, `870.123/2019` e `8701232019` — a normalização é a de
 * `lib/processos.ts`, a mesma do `pipeline/prep.py`. Aceita também trecho de
 * titular ou substância, porque quem atende no balcão raramente tem o número
 * na mão.
 *
 * Busca sem resultado não é beco: o recorte é de 10 municípios, e a tela diz
 * isso e oferece o desenho manual (A.9) em vez de devolver "nada encontrado".
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'
import { normalizarProcesso } from '@/lib/processos'

import { CORES, MONO, SERIF, fmt2 } from './dados'
import { Aviso, s } from './ui'

export interface BuscaProcessoProps {
  indice: IndiceProcessos | null
  erroIndice: string | null
  selecionado: RegistroIndice | null
  onSelecionar: (registro: RegistroIndice) => void
  onDesenhar: () => void
  /**
   * Na tela inicial o campo é o único conteúdo da tela: cresce, centraliza e o
   * rótulo vira etiqueta. Na tela de caracterização ele é um controle entre
   * outros e mantém a escala normal.
   */
  destaque?: boolean
}

export default function BuscaProcesso({
  indice,
  erroIndice,
  selecionado,
  onSelecionar,
  onDesenhar,
  destaque = false,
}: BuscaProcessoProps) {
  const [entrada, setEntrada] = useState('')
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Reflete a seleção vinda de fora (botões de virada, desenho manual) no
  // campo de texto, para que ele nunca contradiga o que está sendo
  // caracterizado — inclusive limpando quando a origem deixa de ser um
  // processo (ex.: usuário desenhou a área por cima de uma busca anterior).
  useEffect(() => {
    setEntrada(selecionado ? selecionado.processo : '')
    setAberto(false)
  }, [selecionado])

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  const sugestoes = useMemo(() => {
    if (!indice || entrada.trim().length < 2) return []
    return indice.sugerir(entrada, 8)
  }, [indice, entrada])

  const digitos = normalizarProcesso(entrada)
  const semSaida =
    aberto && indice !== null && entrada.trim().length >= 3 && sugestoes.length === 0

  function escolher(r: RegistroIndice) {
    onSelecionar(r)
    setEntrada(r.processo)
    setAberto(false)
  }

  function consultar() {
    if (!indice) return
    const exato = indice.porNumero(entrada)
    if (exato) {
      escolher(exato)
      return
    }
    if (sugestoes.length === 1) {
      escolher(sugestoes[0])
      return
    }
    setAberto(true)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label
        htmlFor="anm"
        style={
          destaque
            ? {
                ...s.rotuloCampo,
                ...s.etiqueta,
                color: CORES.terraClara,
                textAlign: 'center',
              }
            : s.rotuloCampo
        }
      >
        Processo da ANM
      </label>

      <div style={{ display: 'flex', gap: 10, marginTop: destaque ? 16 : 10 }}>
        <input
          id="anm"
          value={entrada}
          onChange={(e) => {
            setEntrada(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') consultar()
            if (e.key === 'Escape') setAberto(false)
          }}
          placeholder="870.123/2019, titular ou substância"
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto && sugestoes.length > 0}
          aria-controls="sugestoes-processo"
          style={{
            ...s.campoTexto,
            flex: 1,
            minWidth: 0,
            ...(destaque
              ? {
                  height: 74,
                  fontSize: 'clamp(20px, 4.4vw, 27px)',
                  padding: '0 22px',
                  borderRadius: 8,
                }
              : null),
          }}
        />
        <button
          type="button"
          className="pc-primario"
          onClick={consultar}
          disabled={!indice}
          style={{
            ...s.primario,
            flex: 'none',
            height: destaque ? 74 : 56,
            padding: destaque ? '0 30px' : '0 24px',
            fontSize: destaque ? 18 : 16,
            borderRadius: destaque ? 8 : 6,
            opacity: indice ? 1 : 0.5,
          }}
        >
          Consultar
        </button>
      </div>

      {aberto && sugestoes.length > 0 && (
        <ul
          id="sugestoes-processo"
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            background: CORES.branco,
            border: `1px solid ${CORES.linhaForte}`,
            boxShadow: '0 12px 28px rgba(34, 32, 28, .14)',
            maxHeight: 340,
            overflowY: 'auto',
            borderRadius: 8,
          }}
        >
          {sugestoes.map((r) => (
            <li key={r.processo_norm}>
              <button
                type="button"
                role="option"
                aria-selected={r.processo_norm === selecionado?.processo_norm}
                className="pc-opcao"
                onClick={() => escolher(r)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${CORES.linhaSuave}`,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    color: r.processo_norm.startsWith(digitos) && digitos.length >= 3
                      ? CORES.verde
                      : CORES.tinta,
                  }}
                >
                  {r.processo}
                </span>
                <span style={{ fontSize: 14, color: CORES.cinza, marginLeft: 10 }}>
                  {r.substancia} · {fmt2(r.area_ha)} ha
                </span>
                <div style={{ fontSize: 13, color: CORES.cinzaClaro, marginTop: 3 }}>
                  {r.titular} · {r.municipios.join(', ')}
                  {r.cruza_divisa && ' · cruza divisa'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* O índice é o que faz a busca existir. Quando ele não carrega, o botão
          fica desabilitado — sem esta linha, desabilitado e mudo, e o usuário
          fica clicando num controle que nunca vai responder. */}
      {erroIndice && (
        <Aviso erro>
          {erroIndice} A busca por processo está indisponível — desenhe a poligonal no mapa para
          seguir com a análise.
        </Aviso>
      )}

      {semSaida && (
        <div
          style={{
            marginTop: 14,
            padding: 18,
            background: CORES.branco,
            border: `1px solid ${CORES.linhaForte}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontFamily: SERIF, fontSize: 19 }}>
            Nenhum processo encontrado para “{entrada.trim()}”.
          </div>

          <button
            type="button"
            onClick={onDesenhar}
            style={{
              marginTop: 14,
              height: 46,
              padding: '0 18px',
              background: 'transparent',
              border: `1px solid ${CORES.carvao}`,
              color: CORES.carvao,
              fontSize: 15,
              borderRadius: 6,
            }}
          >
            Desenhar a área no mapa
          </button>
        </div>
      )}
    </div>
  )
}
