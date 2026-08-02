/**
 * ESCOPO F — a tela.
 *
 * Coluna esquerda: área (A) e caracterização (B). Coluna direita: o parecer
 * que o motor (D) devolve. Não existe botão "calcular": o parecer é derivado
 * do estado, então não há caminho em que a direita mostre algo que a esquerda
 * não esteja dizendo.
 *
 * Regra de método herdada do protótipo e mantida: nenhum limiar, órgão ou
 * regra está escrito neste arquivo. Se aparece na tela, veio de `Parecer`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature } from 'geojson'

import { TIPOLOGIAS } from '@/data/fixtures'
import { habilitacaoDe, statusDe } from '@/lib/fatos'
import {
  PASSOS_SLIDER,
  ROTULO_FAIXA,
  formatarPorte,
  linhaFaixa,
  posicaoParaValor,
  tetoSlider,
  valorParaPosicao,
} from '@/lib/porte'
import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'
import { carregarIndice } from '@/lib/processos'
import type { StatusHabilitacao, Tipologia } from '@/lib/schemas'
import { FASES_ANM, SUBSTANCIAS_FREQUENTES } from '@/lib/vocabulario'
import { validar } from '@/lib/validacao'
import { useFormulario } from '@/state/formulario'
import type { UsoHidrico } from '@/state/tipos'

import BuscaProcesso from './BuscaProcesso'
import MapaDesenho from './MapaDesenho'
import type { ResultadoDesenho } from './MapaDesenho'
import MapaProcesso from './MapaProcesso'
import type { MapaHandle, NivelZoom } from './MapaProcesso'
import PainelParecer from './PainelParecer'
import { CORES, SERIF, fmt, fmt2, nomeOrgao } from './dados'
import { baixarPedidoLai } from './lai'
import { Etiqueta, GrupoSegmentado, Pendente, estiloSegmento, s } from './ui'

const ZOOMS: { k: NivelZoom; rotulo: string }[] = [
  { k: 'brasil', rotulo: 'Brasil' },
  { k: 'bahia', rotulo: 'Bahia' },
  { k: 'area', rotulo: 'A área' },
]

const USOS_HIDRICOS: { k: UsoHidrico; rotulo: string }[] = [
  { k: 'captacao', rotulo: 'Captação' },
  { k: 'lancamento', rotulo: 'Lançamento' },
  { k: 'barramento', rotulo: 'Barramento' },
]

const ROTULO_STATUS: Record<StatusHabilitacao, string> = {
  habilitado: 'habilitado no GAC',
  nao_habilitado: 'não habilitado',
  sem_evidencia: 'sem evidência pública',
}

const COR_STATUS: Record<StatusHabilitacao, string> = {
  habilitado: CORES.verde,
  nao_habilitado: CORES.vermelho,
  sem_evidencia: CORES.terraClara,
}

export default function ParecerCompetencia() {
  const { estado, despachar, tipologia, parecer, ms_avaliacao } = useFormulario()

  const [indice, setIndice] = useState<IndiceProcessos | null>(null)
  const [erroIndice, setErroIndice] = useState<string | null>(null)
  const [geometria, setGeometria] = useState<Feature | null>(null)
  const [zoom, setZoom] = useState<NivelZoom>('bahia')
  const [desenhando, setDesenhando] = useState(false)
  const [editando, setEditando] = useState<'substancia' | 'fase' | null>(null)

  const mapaRef = useRef<MapaHandle>(null)

  // Índice de A.5 — 588 KB, carregado uma vez.
  useEffect(() => {
    let vivo = true
    carregarIndice()
      .then((i) => vivo && setIndice(i))
      .catch(() => vivo && setErroIndice('Índice do SIGMINE indisponível.'))
    return () => {
      vivo = false
    }
  }, [])

  // Geometria real do processo, sob demanda do GeoJSON de 3,5 MB.
  useEffect(() => {
    const p = estado.processo
    if (!p || !indice) return
    let vivo = true
    indice
      .geometria(p.processo_norm)
      .then((g) => {
        if (!vivo) return
        setGeometria(g)
        if (g) setZoom('area')
      })
      .catch(() => vivo && setGeometria(null))
    return () => {
      vivo = false
    }
  }, [estado.processo, indice])

  const temArea = estado.origem !== 'nenhuma'
  const pendencias = useMemo(() => validar(estado, tipologia), [estado, tipologia])

  const municipios: string[] =
    estado.processo?.municipios ?? estado.area?.municipios.map((m) => m.nm_mun) ?? []
  const municipioPrincipal = municipios[0] ?? null
  const areaHa = estado.processo?.area_ha ?? estado.area?.area_ha ?? null

  const teto = tipologia ? tetoSlider(tipologia) : 0
  const porte = estado.porte_valor
  const faixaAtual = tipologia && porte !== null ? linhaFaixa(tipologia, porte) : null
  const condicionais = tipologia?.campos_condicionais ?? []

  function selecionarProcesso(r: RegistroIndice) {
    despachar({ tipo: 'selecionar-processo', processo: r })
    setGeometria(null)
  }

  function concluirDesenho(r: ResultadoDesenho) {
    despachar({
      tipo: 'selecionar-area',
      area: {
        area_ha: r.area_ha,
        municipios: r.municipios,
        cruza_divisa: r.municipios.length > 1,
      },
    })
    setGeometria(r.geometria)
    setZoom('area')
    setDesenhando(false)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: CORES.branco,
          borderBottom: `2px solid ${CORES.terra}`,
          padding: 'clamp(16px, 4vw, 30px) clamp(20px, 6vw, 56px)',
        }}
      >
        {!temArea && (
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(22px, 5vw, 30px)',
              color: CORES.cinza,
              ...s.fade,
            }}
          >
            Quem licencia esta operação
          </div>
        )}

        {temArea && parecer.estado === 'DEFINIDA' && (
          <div style={s.fade}>
            <Etiqueta cor={CORES.verde}>competência definida</Etiqueta>
            <div style={{ ...s.titulo, marginTop: 10 }}>
              {nomeOrgao(parecer.orgao, municipioPrincipal)}
            </div>
          </div>
        )}

        {temArea && parecer.estado === 'CONDICIONAL' && (
          <div style={s.fade}>
            <Etiqueta cor={CORES.terraClara}>competência condicional</Etiqueta>
            <div style={{ ...s.titulo, marginTop: 10 }}>
              {nomeOrgao(parecer.orgao, municipioPrincipal)}
            </div>
            {parecer.alertas[0] && (
              <div
                style={{
                  fontSize: 16,
                  color: CORES.cinzaEscuro,
                  marginTop: 10,
                  maxWidth: 820,
                  lineHeight: 1.5,
                }}
              >
                {parecer.alertas[0].detalhe}
              </div>
            )}
          </div>
        )}

        {temArea && parecer.estado === 'INDETERMINADO' && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 24,
              ...s.fade,
            }}
          >
            <div>
              <Etiqueta cor={CORES.cinza}>
                {parecer.fatos_faltantes.length > 0 ? 'falta um dado' : 'sem regra aplicável'}
              </Etiqueta>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(22px, 5vw, 30px)',
                  lineHeight: 1.3,
                  marginTop: 10,
                  maxWidth: 820,
                  textWrap: 'pretty',
                }}
              >
                {parecer.fatos_faltantes[0]?.rotulo ??
                  'Nenhuma regra da base concluiu com os fatos disponíveis.'}
              </div>
            </div>
            {parecer.fatos_faltantes.length > 0 && (
              <button
                type="button"
                className="pc-primario"
                onClick={() => baixarPedidoLai(parecer)}
                style={{ ...s.primario, flex: 'none' }}
              >
                Gerar pedido de acesso à informação
              </button>
            )}
          </div>
        )}
      </header>

      <div className="pc-grid">
        {/* ----------------------------------------------------------------
            Coluna esquerda — área e caracterização
        ---------------------------------------------------------------- */}
        <div
          style={{
            padding: 'clamp(28px, 6vw, 56px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 110px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 52,
          }}
        >
          <section>
            <BuscaProcesso
              indice={indice}
              erroIndice={erroIndice}
              selecionado={estado.processo}
              onSelecionar={selecionarProcesso}
              onDesenhar={() => setDesenhando(true)}
            />

            {/* Cadastro: o que veio do SIGMINE e o que dá para corrigir. */}
            {temArea && (
              <>
                <div
                  className="pc-cadastro-grid"
                  style={{
                    marginTop: 26,
                    borderTop: `1px solid ${CORES.linha}`,
                    borderBottom: `1px solid ${CORES.linha}`,
                  }}
                >
                  <Celula rotulo="Municípios atingidos" indice={0}>
                    {municipios.length === 0 ? (
                      <span style={{ color: CORES.cinza }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {municipios.map((m) => {
                          const st = statusDe(m)
                          const incidencia = estado.area?.municipios.find((x) => x.nm_mun === m)
                          return (
                            <div key={m}>
                              <span style={{ fontFamily: SERIF, fontSize: 19 }}>{m}</span>
                              {incidencia && (
                                <span style={{ fontSize: 13, color: CORES.cinza, marginLeft: 8 }}>
                                  {fmt2(incidencia.proporcao * 100)}%
                                </span>
                              )}
                              <div
                                style={{ fontSize: 12, color: COR_STATUS[st], marginTop: 2 }}
                              >
                                {ROTULO_STATUS[st]}
                                {habilitacaoDe(m)?.nivel ? ` · ${habilitacaoDe(m)?.nivel}` : ''}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Celula>

                  <Celula rotulo="Área da poligonal" indice={1}>
                    <span style={{ fontFamily: SERIF, fontSize: 19 }}>
                      {areaHa === null ? '—' : `${fmt2(areaHa)} ha`}
                    </span>
                    <div style={{ fontSize: 12, color: CORES.cinza, marginTop: 4 }}>
                      {estado.origem === 'processo'
                        ? 'SIGMINE/ANM'
                        : 'derivada do desenho, interseção no cliente'}
                    </div>
                  </Celula>

                  <Celula rotulo="Substância" indice={2}>
                    {editando === 'substancia' ? (
                      <SeletorLivre
                        valor={estado.substancia}
                        opcoes={[...SUBSTANCIAS_FREQUENTES]}
                        onEscolher={(v) => {
                          despachar({ tipo: 'substancia', valor: v })
                          setEditando(null)
                        }}
                      />
                    ) : (
                      <ValorEditavel
                        valor={estado.substancia}
                        editado={estado.substancia_editada}
                        temProcesso={estado.processo !== null}
                        onEditar={() => setEditando('substancia')}
                        onRestaurar={() =>
                          despachar({ tipo: 'restaurar-sigmine', campo: 'substancia' })
                        }
                      />
                    )}
                  </Celula>

                  <Celula rotulo="Fase na ANM" indice={3}>
                    {editando === 'fase' ? (
                      <SeletorLivre
                        valor={estado.fase}
                        opcoes={[...FASES_ANM]}
                        onEscolher={(v) => {
                          despachar({ tipo: 'fase', valor: v })
                          setEditando(null)
                        }}
                      />
                    ) : (
                      <ValorEditavel
                        valor={estado.fase}
                        editado={estado.fase_editada}
                        temProcesso={estado.processo !== null}
                        onEditar={() => setEditando('fase')}
                        onRestaurar={() => despachar({ tipo: 'restaurar-sigmine', campo: 'fase' })}
                      />
                    )}
                  </Celula>
                </div>

                {(estado.substancia_editada || estado.fase_editada) && (
                  <div style={{ fontSize: 13, color: CORES.terraClara, marginTop: 10 }}>
                    Corrigido manualmente — diverge do cadastro da ANM.
                  </div>
                )}
              </>
            )}

            {/* Tipologia — define o parâmetro de porte, as faixas e os condicionais.
                Em destaque, acima do mapa: é a primeira decisão que reconfigura tudo
                o que vem depois. */}
            <div style={{ marginTop: 26 }}>
              <label htmlFor="tipologia" style={s.rotuloCampo}>
                Tipo de operação
              </label>
              <SeletorTipologia
                id="tipologia"
                tipologias={TIPOLOGIAS}
                selecionadoId={estado.tipologia_id}
                onEscolher={(id) => despachar({ tipo: 'tipologia', id })}
              />
              {tipologia && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    fontSize: 13,
                    color: CORES.cinza,
                    marginTop: 8,
                  }}
                >
                  <span>
                    {tipologia.grupo} · potencial poluente {tipologia.potencial_poluente}
                  </span>
                  {!tipologia.fundamento.verificado && <Pendente />}
                </div>
              )}
            </div>

            {/* O mapa. Geometria real do SIGMINE, ou a poligonal desenhada. */}
            <div style={{ marginTop: 26 }}>
              <div style={{ marginBottom: 12 }}>
                <GrupoSegmentado>
                  {ZOOMS.map(({ k, rotulo }, i) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setZoom(k)}
                      disabled={k === 'area' && !geometria}
                      style={{
                        ...estiloSegmento(zoom === k, i === 0, false),
                        opacity: k === 'area' && !geometria ? 0.45 : 1,
                      }}
                    >
                      {rotulo}
                    </button>
                  ))}
                </GrupoSegmentado>
              </div>

              <div style={{ position: 'relative' }}>
                <MapaProcesso ref={mapaRef} geometria={geometria} nivel={zoom} />
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    border: `1px solid ${CORES.linhaForte}`,
                    background: CORES.branco,
                  }}
                >
                  <button
                    type="button"
                    className="pc-lupa"
                    onClick={() => mapaRef.current?.escalar(1.7)}
                    aria-label="Aproximar o mapa"
                    style={botaoLupa}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="pc-lupa"
                    onClick={() => mapaRef.current?.escalar(1 / 1.7)}
                    aria-label="Afastar o mapa"
                    style={{ ...botaoLupa, borderTop: `1px solid ${CORES.linhaForte}` }}
                  >
                    −
                  </button>
                </div>
              </div>


              <button
                type="button"
                onClick={() => setDesenhando(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '12px 0 0',
                  color: CORES.verde,
                  fontSize: 15,
                }}
              >
                Desenhar ou marcar a área manualmente
              </button>
            </div>
          </section>

          {/* Porte — escala logarítmica, faixas da tipologia, viradas do motor. */}
          <section>
            <label htmlFor="porte" style={s.rotuloCampo}>
              {tipologia
                ? `${maiuscula(tipologia.parametro_porte)} (${tipologia.unidade_porte})`
                : 'Porte'}
            </label>

            {!tipologia ? (
              <div style={{ fontSize: 15, color: CORES.cinza, marginTop: 10, lineHeight: 1.55 }}>
                Escolha a tipologia primeiro — é ela que define o parâmetro de porte, a unidade
                e as fronteiras de faixa.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    marginTop: 10,
                    borderBottom: `1px solid ${CORES.linhaForte}`,
                    width: 'fit-content',
                    paddingBottom: 6,
                  }}
                >
                  <input
                    id="porte"
                    value={porte === null ? '' : fmt(porte)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                      despachar({ tipo: 'porte', valor: isNaN(n) ? 0 : Math.min(n, teto) })
                    }}
                    placeholder="0"
                    aria-label={`${tipologia.parametro_porte} em ${tipologia.unidade_porte}`}
                    style={{
                      width: 'clamp(120px, 40vw, 190px)',
                      fontFamily: SERIF,
                      fontSize: 'clamp(30px, 8vw, 42px)',
                      fontVariantNumeric: 'tabular-nums',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'right',
                    }}
                  />
                  <span style={{ fontSize: 16, color: CORES.terra }}>
                    {tipologia.unidade_porte}
                  </span>
                </div>

                <BarraPorte
                  faixas={tipologia.faixas}
                  teto={teto}
                  faixaAtual={faixaAtual?.faixa ?? null}
                  limiares={parecer.limiares.map((l) => ({
                    valor: l.valor,
                    rotulo: `${fmt(l.valor)} ${l.unidade}`,
                  }))}
                  valor={porte ?? 0}
                  onValor={(v) => despachar({ tipo: 'porte', valor: v })}
                />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 22,
                    paddingTop: 16,
                    borderTop: `1px solid ${CORES.linha}`,
                  }}
                >
                  {faixaAtual ? (
                    <>
                      <span style={{ fontFamily: SERIF, fontSize: 22, color: CORES.terra }}>
                        {ROTULO_FAIXA[faixaAtual.faixa]}
                      </span>
                      <span style={{ fontSize: 15, color: CORES.cinzaEscuro }}>
                        {formatarPorte(faixaAtual.min, tipologia.unidade_porte)}
                        {faixaAtual.max === null
                          ? ' ou mais'
                          : ` até ${formatarPorte(faixaAtual.max, tipologia.unidade_porte)}`}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 15, color: CORES.cinza }}>
                      Informe o porte para enquadrar a faixa.
                    </span>
                  )}
                </div>

                {parecer.limiares.length > 0 && (
                  <div style={{ fontSize: 14, color: CORES.terra, marginTop: 10, lineHeight: 1.55 }}>
                    {parecer.limiares.map((l) => (
                      <div key={l.valor}>
                        Em {formatarPorte(l.valor, l.unidade)} a competência passa de{' '}
                        {l.instancia_abaixo} para {l.instancia_acima}.
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Condicionais — só os que a tipologia ativa (B.5). */}
          {condicionais.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {condicionais.includes('supressao_vegetacao') && (
                <div>
                  <div style={{ fontSize: 15, color: CORES.terra }}>
                    Supressão de vegetação nativa
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <GrupoSegmentado>
                      {[
                        { v: false, r: 'Não' },
                        { v: true, r: 'Sim' },
                      ].map(({ v, r }, i) => (
                        <button
                          type="button"
                          key={r}
                          onClick={() =>
                            despachar({
                              tipo: 'condicional',
                              campo: 'supressao_vegetacao',
                              valor: v,
                            })
                          }
                          style={estiloSegmento(
                            estado.condicionais.supressao_vegetacao === v,
                            i === 0,
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </GrupoSegmentado>
                  </div>
                  {estado.condicionais.supressao_vegetacao === true && (
                    <div
                      style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}
                    >
                      <input
                        value={estado.condicionais.supressao_ha ?? ''}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(',', '.'))
                          despachar({
                            tipo: 'condicional',
                            campo: 'supressao_ha',
                            valor: isNaN(n) ? null : n,
                          })
                        }}
                        inputMode="decimal"
                        aria-label="hectares de supressão"
                        style={{
                          width: 120,
                          height: 48,
                          padding: '0 12px',
                          background: CORES.branco,
                          border: `1px solid ${CORES.linhaForte}`,
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 17,
                        }}
                      />
                      <span style={{ fontSize: 15, color: CORES.cinza }}>hectares</span>
                    </div>
                  )}
                </div>
              )}

              {condicionais.includes('recurso_hidrico') && (
                <div>
                  <div style={{ fontSize: 15, color: CORES.terra }}>
                    Interferência em recurso hídrico
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <GrupoSegmentado>
                      {USOS_HIDRICOS.map(({ k, rotulo }, i) => {
                        const ativo = estado.condicionais.recurso_hidrico.includes(k)
                        return (
                          <button
                            type="button"
                            key={k}
                            aria-pressed={ativo}
                            onClick={() =>
                              despachar({
                                tipo: 'condicional',
                                campo: 'recurso_hidrico',
                                valor: ativo
                                  ? estado.condicionais.recurso_hidrico.filter((x) => x !== k)
                                  : [...estado.condicionais.recurso_hidrico, k],
                              })
                            }
                            style={estiloSegmento(ativo, i === 0)}
                          >
                            {rotulo}
                          </button>
                        )
                      })}
                    </GrupoSegmentado>
                  </div>
                </div>
              )}

              {condicionais.includes('explosivos') && (
                <div>
                  <div style={{ fontSize: 15, color: CORES.terra }}>
                    Uso de explosivos no desmonte
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <GrupoSegmentado>
                      {[
                        { v: false, r: 'Não' },
                        { v: true, r: 'Sim' },
                      ].map(({ v, r }, i) => (
                        <button
                          type="button"
                          key={r}
                          onClick={() =>
                            despachar({ tipo: 'condicional', campo: 'explosivos', valor: v })
                          }
                          style={estiloSegmento(estado.condicionais.explosivos === v, i === 0)}
                        >
                          {r}
                        </button>
                      ))}
                    </GrupoSegmentado>
                  </div>
                </div>
              )}
            </section>
          )}

          
        </div>

        {/* ----------------------------------------------------------------
            Coluna direita — o parecer
        ---------------------------------------------------------------- */}
        <div
          className="pc-col-right"
          style={{
            padding: 'clamp(28px, 6vw, 56px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 110px)',
            background: CORES.painel,
          }}
        >
          <PainelParecer
            parecer={parecer}
            temArea={temArea}
            municipioPrincipal={municipioPrincipal}
            msAvaliacao={ms_avaliacao}
          />
        </div>
      </div>

      {desenhando && (
        <Modal titulo="Desenhar a poligonal" onFechar={() => setDesenhando(false)}>
          <MapaDesenho onConcluir={concluirDesenho} onCancelar={() => setDesenhando(false)} />
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peças locais
// ---------------------------------------------------------------------------

const botaoLupa = {
  width: 46,
  height: 46,
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  lineHeight: 1,
  color: CORES.tinta,
} as const

function maiuscula(s2: string): string {
  return s2.charAt(0).toUpperCase() + s2.slice(1)
}

function Celula({
  rotulo,
  indice,
  children,
}: {
  rotulo: string
  indice: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '16px 0 18px',
        minHeight: 86,
        borderTop: indice >= 2 ? `1px solid ${CORES.linhaSuave}` : 'none',
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: CORES.terraClara,
        }}
      >
        {rotulo}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

/**
 * Valor de cadastro com a marca de origem. B.2: quando o usuário sobrescreve o
 * que veio do SIGMINE, o dado deixa de ser cadastro e vira declaração — e a
 * tela tem de deixar isso visível, com caminho de volta.
 */
function ValorEditavel({
  valor,
  editado,
  temProcesso,
  onEditar,
  onRestaurar,
}: {
  valor: string
  editado: boolean
  temProcesso: boolean
  onEditar: () => void
  onRestaurar: () => void
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onEditar}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          fontFamily: SERIF,
          fontSize: 19,
          lineHeight: 1.25,
          color: valor ? CORES.tinta : CORES.cinzaClaro,
        }}
      >
        {valor || 'informar'}
      </button>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: CORES.cinza,
          marginTop: 4,
        }}
      >
        <span>{editado ? 'declarado' : temProcesso ? 'SIGMINE/ANM' : 'a declarar'}</span>
        {editado && temProcesso && (
          <button
            type="button"
            onClick={onRestaurar}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: CORES.verde,
              textDecoration: 'underline',
            }}
          >
            restaurar do SIGMINE
          </button>
        )}
      </div>
    </div>
  )
}

/** Lista de atalhos + texto livre: o campo aceita valor fora da lista. */
function SeletorLivre({
  valor,
  opcoes,
  onEscolher,
}: {
  valor: string
  opcoes: string[]
  onEscolher: (v: string) => void
}) {
  const [texto, setTexto] = useState(valor)
  const listaId = `opcoes-${opcoes.length}-${opcoes[0]}`
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        autoFocus
        list={listaId}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEscolher(texto.trim())
          if (e.key === 'Escape') onEscolher(valor)
        }}
        onBlur={() => onEscolher(texto.trim())}
        style={{
          flex: 1,
          minWidth: 0,
          height: 44,
          border: `1px solid ${CORES.verde}`,
          background: CORES.branco,
          padding: '0 8px',
          fontSize: 16,
        }}
      />
      <datalist id={listaId}>
        {opcoes.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  )
}

/**
 * Seletor de tipologia — combobox custom no lugar do `<select>` nativo, para
 * o menu aberto seguir a mesma linguagem visual do resto da tela (painel
 * branco, borda `linhaForte`, opções no estilo `pc-opcao` de BuscaProcesso)
 * em vez do popup do sistema operacional.
 */
function SeletorTipologia({
  id,
  tipologias,
  selecionadoId,
  onEscolher,
}: {
  id: string
  tipologias: Tipologia[]
  selecionadoId: string | null
  onEscolher: (id: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const atual = tipologias.find((t) => t.id === selecionadoId) ?? null

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', marginTop: 10 }}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-opcoes`}
        aria-haspopup="listbox"
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberto(false)
        }}
        style={{
          ...s.select,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          textAlign: 'left',
          color: atual ? CORES.tinta : CORES.cinzaClaro,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {atual?.atividade ?? 'Escolha a tipologia licenciável'}
        </span>
        <span
          aria-hidden
          style={{
            flex: 'none',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid ${CORES.terra}`,
            transform: aberto ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {aberto && (
        <ul
          id={`${id}-opcoes`}
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
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {tipologias.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={t.id === selecionadoId}
                className="pc-opcao"
                onClick={() => {
                  onEscolher(t.id)
                  setAberto(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${CORES.linhaSuave}`,
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 14, flex: 'none', color: CORES.verde, fontSize: 14 }}
                >
                  {t.id === selecionadoId ? '✓' : ''}
                </span>
                <span style={{ fontSize: 16 }}>{t.atividade}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(34, 32, 28, .42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 40px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div
        style={{
          background: CORES.fundo,
          border: `1px solid ${CORES.linhaForte}`,
          width: 'min(860px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 'clamp(20px, 4vw, 32px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 18,
          }}
        >
          <div style={{ fontFamily: SERIF, fontSize: 26 }}>{titulo}</div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            style={{ background: 'none', border: 'none', fontSize: 22, color: CORES.cinza }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Barra de faixas + controle deslizante, ambos em escala logarítmica — as
 * faixas cobrem de 10³ a 10⁶ na mesma tipologia, e em escala linear as três
 * primeiras ficariam espremidas nos primeiros pixels (B.4).
 *
 * As marcas de limiar NÃO são constantes: vêm de `Parecer.limiares`, que D.4
 * encontrou reavaliando o motor em cada fronteira de faixa. Se a base de
 * regras mudar, as marcas mudam sozinhas.
 */
function BarraPorte({
  faixas,
  teto,
  faixaAtual,
  limiares,
  valor,
  onValor,
}: {
  faixas: { faixa: string; min: number; max: number | null }[]
  teto: number
  faixaAtual: string | null
  limiares: { valor: number; rotulo: string }[]
  valor: number
  onValor: (v: number) => void
}) {
  const pos = (v: number) => (valorParaPosicao(v, teto) / PASSOS_SLIDER) * 100

  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ position: 'relative', height: 22, marginBottom: 4 }}>
        {limiares.map((l) => (
          <div
            key={l.valor}
            style={{
              position: 'absolute',
              left: `calc(13px + ${pos(l.valor)}% - 26px)`,
              top: 0,
              transform: 'translateX(0)',
              fontSize: 12,
              color: CORES.terra,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {l.rotulo}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', height: 30 }}>
        <div style={{ position: 'absolute', left: 13, right: 13, top: 4, height: 22 }}>
          {faixas.map((f) => {
            const esq = pos(f.min)
            const dir = pos(f.max ?? teto)
            return (
              <div
                key={f.faixa}
                title={ROTULO_FAIXA[f.faixa as keyof typeof ROTULO_FAIXA]}
                style={{
                  position: 'absolute',
                  left: `${esq}%`,
                  width: `${Math.max(0, dir - esq)}%`,
                  top: 0,
                  height: 22,
                  borderLeft: f.min === 0 ? 'none' : `1px solid ${CORES.fundo}`,
                  background: f.faixa === faixaAtual ? 'rgba(74, 94, 54, .30)' : CORES.barra,
                }}
              />
            )
          })}
        </div>

        <div
          style={{ position: 'absolute', left: 13, right: 13, top: 0, height: 30, pointerEvents: 'none' }}
        >
          {limiares.map((l) => (
            <div
              key={l.valor}
              style={{
                position: 'absolute',
                left: `${pos(l.valor)}%`,
                top: 0,
                width: 2,
                height: 30,
                background: CORES.terra,
              }}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={PASSOS_SLIDER}
          step={1}
          value={valorParaPosicao(valor, teto)}
          onChange={(e) => onValor(posicaoParaValor(Number(e.target.value), teto))}
          aria-label="porte"
          aria-valuetext={fmt(valor)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: 30, margin: 0 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 12,
          color: CORES.cinzaClaro,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>0</span>
        <span>{fmt(teto)}</span>
      </div>
    </div>
  )
}
