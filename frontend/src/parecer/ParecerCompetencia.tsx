import { useMemo, useRef, useState, type CSSProperties } from 'react'
import MapaProcesso, { type MapaHandle, type NivelZoom } from './MapaProcesso'
import {
  AREAS,
  CENTROS,
  CORES,
  FAIXAS,
  FASES,
  HABILITADOS,
  LIMIAR,
  MONO,
  MUNICIPIOS,
  PORTE_MAX,
  SERIF,
  SUBSTANCIAS,
  TIPOLOGIAS,
  USOS_AGUA,
  faixaDe,
  fmt,
} from './dados'

type Veredito = 'inicial' | 'definida' | 'condicional' | 'indeterminado'
type CampoCadastro = 'municipio' | 'area' | 'substancia' | 'fase'
type Cadastro = Record<CampoCadastro, string>

const CAMPOS: { key: CampoCadastro; rotulo: string; opcoes: string[] }[] = [
  { key: 'municipio', rotulo: 'Município', opcoes: MUNICIPIOS },
  { key: 'area', rotulo: 'Área', opcoes: AREAS },
  { key: 'substancia', rotulo: 'Substância', opcoes: SUBSTANCIAS },
  { key: 'fase', rotulo: 'Fase', opcoes: FASES },
]

const ZOOMS: { k: NivelZoom; rotulo: string }[] = [
  { k: 'brasil', rotulo: 'Brasil' },
  { k: 'bahia', rotulo: 'Bahia' },
  { k: 'area', rotulo: 'A área' },
]

function calcularVeredito(temArea: boolean, porte: number, municipio: string): Veredito {
  if (!temArea) return 'inicial'
  if (porte >= LIMIAR) return 'definida'
  if (!HABILITADOS.includes(municipio)) return 'indeterminado'
  if (porte >= 85000) return 'condicional'
  return 'definida'
}

const s = {
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
  fade: { animation: 'vfade 200ms ease' } satisfies CSSProperties,
}

function estiloSegmento(ativo: boolean, primeiro: boolean, alto = true): CSSProperties {
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

function GrupoSegmentado({ children }: { children: React.ReactNode }) {
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

export default function ParecerCompetencia() {
  const [processo, setProcesso] = useState('870.123/2019')
  const [cadastro, setCadastro] = useState<Cadastro>({
    municipio: 'Jacobina (BA)',
    area: '486 ha',
    substancia: 'Ouro',
    fase: 'Concessão de lavra',
  })
  const [zoom, setZoom] = useState<NivelZoom>('brasil')
  const [corrigido, setCorrigido] = useState(false)
  const [editando, setEditando] = useState<CampoCadastro | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [temArea, setTemArea] = useState(true)
  const [areaAberta, setAreaAberta] = useState(false)
  const [tipologia, setTipologia] = useState('Lavra a céu aberto')
  const [porte, setPorte] = useState(120000)
  const [supressao, setSupressao] = useState('Sim')
  const [hectares, setHectares] = useState('12')
  const [agua, setAgua] = useState<string[]>(['Captação'])
  const [explosivos, setExplosivos] = useState('Sim')
  const [aberto, setAberto] = useState<'regras' | null>(null)

  const mapaRef = useRef<MapaHandle>(null)

  const { municipio } = cadastro
  const municipioCurto = municipio.replace(' (BA)', '')
  const veredito = calcularVeredito(temArea, porte, municipio)
  const faixa = faixaDe(porte)
  const acima = porte >= LIMIAR
  const orgao = acima ? 'INEMA' : `Prefeitura de ${municipioCurto}`
  const temParecer = veredito === 'definida' || veredito === 'condicional'
  const centro = CENTROS[municipio] ?? CENTROS['Jacobina (BA)']

  const contatos = useMemo(() => {
    const lista = [{ orgao: 'INEMA — Licenciamento', telefone: '(71) 3118-4000' }]
    if (supressao === 'Sim')
      lista.push({ orgao: 'INEMA — Florestas e Biodiversidade', telefone: '(71) 3118-4270' })
    if (agua.length) lista.push({ orgao: 'INEMA — Recursos Hídricos', telefone: '(71) 3118-4144' })
    if (explosivos === 'Sim') lista.push({ orgao: 'Exército — SFPC/6', telefone: '(71) 3202-2000' })
    lista.push({ orgao: 'ANM Bahia', telefone: '(71) 3271-8600' })
    lista.push({ orgao: 'IPHAN Bahia', telefone: '(71) 3324-1400' })
    return lista.map((c) => ({ ...c, tel: `tel:+55${c.telefone.replace(/\D/g, '')}` }))
  }, [supressao, agua, explosivos])

  const regras = useMemo(
    () =>
      (
        [
          ['A área está integralmente na Bahia, sem sobreposição federal.', 'LC 140/2011, art. 7º, XIV', false],
          ['A tipologia declarada está sujeita a licenciamento estadual.', 'Resolução CEPRAM 4.579/2018', false],
          [`O porte de ${fmt(porte)} t/ano fica na faixa ${faixa.nome}.`, 'tabela estadual de porte', false],
          [
            acima
              ? 'Porte a partir de 100.000 t/ano afasta a competência municipal.'
              : 'Porte abaixo de 100.000 t/ano admite competência municipal.',
            'LC 140/2011, art. 9º, XIV, a',
            false,
          ],
          ['O município consta habilitado no programa GAC.', 'Portaria SEMA — GAC', true],
          ['Porte × potencial poluente define rito ordinário, não LAC.', 'Lei estadual 10.431/2006, art. 111', false],
          ['Supressão declarada exige ASV antes da LI.', 'Lei 11.428/2006, art. 14', false],
          ['Prazos máximos de análise: 6 meses por licença.', 'Lei 15.190/2025, art. 24', true],
        ] as [string, string, boolean][]
      ).map(([texto, dispositivo, aConferir]) => ({ texto, dispositivo, aConferir })),
    [porte, faixa.nome, acima],
  )

  const apurado = [
    { rotulo: 'Processo ANM', valor: processo },
    { rotulo: 'Tipo de operação', valor: tipologia },
    { rotulo: 'Produção', valor: `${fmt(porte)} t/ano` },
    { rotulo: 'Habilitação no GAC', valor: 'sem registro público' },
  ]

  const consultar = () => {
    setConsultando(true)
    setTimeout(() => {
      setConsultando(false)
      setTemArea(true)
    }, 450)
  }

  const alterarCampo = (key: CampoCadastro, valor: string) => {
    setCadastro((c) => ({ ...c, [key]: valor }))
    setEditando(null)
    setCorrigido(true)
  }

  const alternarAgua = (uso: string) =>
    setAgua((atual) => (atual.includes(uso) ? atual.filter((x) => x !== uso) : [...atual, uso]))

  const posLimiar = `${(LIMIAR / PORTE_MAX) * 100}%`

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
        {veredito === 'inicial' && (
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

        {veredito === 'condicional' && (
          <div style={s.fade}>
            <div style={{ ...s.etiqueta, color: CORES.terraClara }}>competência condicional</div>
            <div className="pc-cond-grid">
              <div style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 6vw, 40px)', lineHeight: 1.05 }}>
                Prefeitura de {municipioCurto}
              </div>
              <div
                className="pc-divider"
                style={{
                  position: 'relative',
                  alignSelf: 'stretch',
                  background: CORES.linha,
                  minHeight: 66,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: CORES.branco,
                    padding: '5px 10px',
                    fontSize: 13,
                    color: CORES.terra,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  limiar 100.000 t/ano
                </div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 6vw, 40px)', lineHeight: 1.05 }}>
                INEMA
              </div>
            </div>
          </div>
        )}

        {veredito === 'indeterminado' && (
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
              <div style={{ ...s.etiqueta, color: CORES.cinza }}>falta um dado</div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(22px, 5vw, 30px)',
                  lineHeight: 1.3,
                  marginTop: 10,
                  maxWidth: 800,
                }}
              >
                Não há registro público da habilitação ambiental de {municipio} junto ao programa
                GAC.
              </div>
            </div>
            <button type="button" className="pc-primario" style={{ ...s.primario, flex: 'none' }}>
              Gerar pedido de acesso à informação
            </button>
          </div>
        )}

        {veredito === 'definida' && (
          <div style={s.fade}>
            <div style={{ ...s.etiqueta, color: CORES.verde }}>competência definida</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 44,
                marginTop: 10,
              }}
            >
              <div style={s.titulo}>{orgao}</div>
            </div>
          </div>
        )}
      </header>

      <div className="pc-grid">
        <div
          style={{
            padding:
              'clamp(28px, 6vw, 56px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 110px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 56,
          }}
        >
          <section>
            <label htmlFor="anm" style={s.rotuloCampo}>
              Processo da ANM
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input
                id="anm"
                value={processo}
                onChange={(e) => setProcesso(e.target.value)}
                placeholder="870.123/2019"
                style={{ ...s.campoTexto, flex: 1 }}
              />
              <button
                type="button"
                className="pc-primario"
                onClick={consultar}
                style={{ ...s.primario, flex: 'none', height: 56, padding: '0 24px' }}
              >
                {consultando ? 'Calculando…' : 'Consultar'}
              </button>
            </div>

            <div
              className="pc-cadastro-grid"
              style={{
                marginTop: 22,
                borderTop: `1px solid ${CORES.linha}`,
                borderBottom: `1px solid ${CORES.linha}`,
              }}
            >
              {CAMPOS.map(({ key, rotulo, opcoes }, i) => (
                <div
                  key={key}
                  onClick={() => setEditando(key)}
                  style={{
                    padding: '16px 0 18px',
                    minHeight: 86,
                    cursor: 'pointer',
                    borderTop: i >= 2 ? `1px solid ${CORES.linhaSuave}` : 'none',
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
                  {editando === key ? (
                    <select
                      autoFocus
                      value={cadastro[key]}
                      onChange={(e) => alterarCampo(key, e.target.value)}
                      style={{
                        width: '100%',
                        height: 44,
                        marginTop: 6,
                        border: `1px solid ${CORES.verde}`,
                        background: CORES.branco,
                        padding: '0 8px',
                        fontSize: 16,
                      }}
                    >
                      {opcoes.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      style={{
                        fontFamily: SERIF,
                        fontSize: 19,
                        marginTop: 8,
                        lineHeight: 1.25,
                        textWrap: 'pretty',
                      }}
                    >
                      {cadastro[key]}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {corrigido && (
              <div style={{ fontSize: 13, color: CORES.terraClara, marginTop: 10 }}>
                Corrigido manualmente — diverge do cadastro da ANM.
              </div>
            )}

            <div style={{ marginTop: 26 }}>
              <div style={{ marginBottom: 12, width: 'fit-content' }}>
                <GrupoSegmentado>
                  {ZOOMS.map(({ k, rotulo }, i) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setZoom(k)}
                      style={estiloSegmento(zoom === k, i === 0, false)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </GrupoSegmentado>
              </div>

              <div style={{ position: 'relative' }}>
                <MapaProcesso
                  ref={mapaRef}
                  centro={centro}
                  nivel={zoom}
                  rotulo={municipioCurto}
                />
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
                    style={{
                      width: 46,
                      height: 46,
                      border: 'none',
                      background: 'transparent',
                      fontSize: 24,
                      lineHeight: 1,
                      color: CORES.tinta,
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="pc-lupa"
                    onClick={() => mapaRef.current?.escalar(1 / 1.7)}
                    aria-label="Afastar o mapa"
                    style={{
                      width: 46,
                      height: 46,
                      border: 'none',
                      borderTop: `1px solid ${CORES.linhaForte}`,
                      background: 'transparent',
                      fontSize: 24,
                      lineHeight: 1,
                      color: CORES.tinta,
                    }}
                  >
                    −
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: CORES.cinza, marginTop: 8 }}>
                Arraste para mover, role para aproximar · geometria Natural Earth
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAreaAberta((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                padding: '12px 0 0',
                color: CORES.verde,
                fontSize: 15,
              }}
            >
              {areaAberta ? 'Ocultar opções de desenho' : 'Desenhar ou marcar a área manualmente'}
            </button>
            {areaAberta && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                  <a href="#desenhar" style={{ fontSize: 15 }}>
                    Desenhar no mapa
                  </a>
                  <a href="#ponto" style={{ fontSize: 15 }}>
                    Marcar um ponto
                  </a>
                </div>
              </div>
            )}
          </section>

          <section>
            <label htmlFor="tipologia" style={s.rotuloCampo}>
              Tipo de operação
            </label>
            <select
              id="tipologia"
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value)}
              style={{
                width: '100%',
                height: 56,
                marginTop: 10,
                padding: '0 14px',
                background: CORES.branco,
                border: `1px solid ${CORES.linhaForte}`,
                fontSize: 18,
              }}
            >
              {TIPOLOGIAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label htmlFor="porte" style={s.rotuloCampo}>
              Produção por ano
            </label>
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
                value={fmt(porte)}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
                  setPorte(isNaN(n) ? 0 : Math.min(n, PORTE_MAX))
                }}
                aria-label="produção anual em toneladas"
                size={7}
                style={{
                  width: 'clamp(120px, 40vw, 168px)',
                  fontFamily: SERIF,
                  fontSize: 'clamp(30px, 8vw, 42px)',
                  fontVariantNumeric: 'tabular-nums',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'right',
                }}
              />
              <span style={{ fontSize: 16, color: CORES.terra }}>t/ano</span>
            </div>

            <div style={{ position: 'relative', marginTop: 34 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 13,
                  right: 13,
                  top: -22,
                  height: 22,
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: posLimiar,
                    top: 0,
                    transform: 'translateX(-50%)',
                    fontSize: 12,
                    color: CORES.terra,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  limiar 100.000
                </div>
              </div>
              <div style={{ position: 'relative', height: 30 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 13,
                    right: 13,
                    top: 4,
                    display: 'flex',
                    height: 22,
                  }}
                >
                  {FAIXAS.map((f, i) => {
                    const de = i === 0 ? 0 : FAIXAS[i - 1].ate
                    const ativa = f.nome === faixa.nome
                    return (
                      <div
                        key={f.nome}
                        style={{
                          width: `${((f.ate - de) / PORTE_MAX) * 100}%`,
                          borderLeft: i === 0 ? 'none' : `1px solid ${CORES.fundo}`,
                          background: ativa ? 'rgba(74,94,54,.30)' : CORES.barra,
                        }}
                      />
                    )
                  })}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 13,
                    right: 13,
                    top: 0,
                    height: 30,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: posLimiar,
                      top: 0,
                      width: 2,
                      height: 30,
                      background: CORES.terra,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={PORTE_MAX}
                  step={1000}
                  value={porte}
                  onChange={(e) => setPorte(Number(e.target.value))}
                  aria-label="produção anual"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: 30,
                    margin: 0,
                  }}
                />
              </div>
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
              <span>500.000 t/ano</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginTop: 22,
                paddingTop: 16,
                borderTop: `1px solid ${CORES.linha}`,
              }}
            >
              <span style={{ fontFamily: SERIF, fontSize: 22, color: CORES.terra }}>
                Faixa {faixa.nome}
              </span>
              <span style={{ fontSize: 15, color: CORES.cinzaEscuro }}>
                {faixa.pot} · {acima ? 'competência do Estado' : 'competência da Prefeitura'}
              </span>
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div>
              <div style={{ fontSize: 15, color: CORES.terra }}>Supressão de vegetação</div>
              <div style={{ marginTop: 10, width: 'fit-content' }}>
                <GrupoSegmentado>
                  {['Não', 'Sim'].map((o, i) => (
                    <button
                      type="button"
                      key={o}
                      onClick={() => setSupressao(o)}
                      style={estiloSegmento(supressao === o, i === 0)}
                    >
                      {o}
                    </button>
                  ))}
                </GrupoSegmentado>
              </div>
              {supressao === 'Sim' && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                  <input
                    value={hectares}
                    onChange={(e) => setHectares(e.target.value.replace(/[^\d.,]/g, ''))}
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

            <div>
              <div style={{ fontSize: 15, color: CORES.terra }}>Uso de água</div>
              <div style={{ marginTop: 10, width: 'fit-content' }}>
                <GrupoSegmentado>
                  {USOS_AGUA.map((o, i) => (
                    <button
                      type="button"
                      key={o}
                      onClick={() => alternarAgua(o)}
                      style={estiloSegmento(agua.includes(o), i === 0)}
                    >
                      {o}
                    </button>
                  ))}
                </GrupoSegmentado>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 15, color: CORES.terra }}>Uso de explosivos</div>
              <div style={{ marginTop: 10, width: 'fit-content' }}>
                <GrupoSegmentado>
                  {['Não', 'Sim'].map((o, i) => (
                    <button
                      type="button"
                      key={o}
                      onClick={() => setExplosivos(o)}
                      style={estiloSegmento(explosivos === o, i === 0)}
                    >
                      {o}
                    </button>
                  ))}
                </GrupoSegmentado>
              </div>
            </div>
          </section>
        </div>

        <div
          className="pc-col-right"
          style={{
            padding:
              'clamp(28px, 6vw, 56px) clamp(20px, 6vw, 56px) clamp(48px, 10vw, 110px)',
            background: CORES.painel,
          }}
        >
          {veredito === 'inicial' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 560,
              }}
            >
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 26,
                  lineHeight: 1.4,
                  color: CORES.cinza,
                  textAlign: 'center',
                  maxWidth: 420,
                  textWrap: 'pretty',
                }}
              >
                Informe o processo da ANM para gerar o parecer.
              </div>
            </div>
          )}

          {veredito === 'indeterminado' && (
            <div style={{ maxWidth: 520 }}>
              <div style={{ fontSize: 17, lineHeight: 1.65 }}>
                Todo o resto já está apurado. Só a habilitação de {municipio} no GAC impede fechar a
                competência.
              </div>
              <div style={{ marginTop: 30, borderTop: `1px solid ${CORES.linha}` }}>
                {apurado.map((p) => (
                  <div
                    key={p.rotulo}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 20,
                      padding: '18px 0',
                      borderBottom: `1px solid ${CORES.linha}`,
                    }}
                  >
                    <span style={{ fontSize: 15, color: CORES.cinza }}>{p.rotulo}</span>
                    <span style={{ fontSize: 16, textAlign: 'right' }}>{p.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {temParecer && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: 24,
                    paddingBottom: 6,
                    color: CORES.terra,
                  }}
                >
                  Para quem ligar
                </div>
                {contatos.map((c) => (
                  <div
                    key={c.orgao}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 24,
                      alignItems: 'center',
                      padding: '20px 0',
                      borderTop: `1px solid ${CORES.linhaSuave}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 19 }}>{c.orgao}</div>
                    </div>
                    <a
                      href={c.tel}
                      style={{
                        fontFamily: SERIF,
                        fontSize: 28,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        padding: '8px 0',
                        display: 'inline-block',
                      }}
                    >
                      {c.telefone}
                    </a>
                  </div>
                ))}
              </div>

              <div style={{ borderBottom: `1px solid ${CORES.linha}` }}>
                <button
                  type="button"
                  className="pc-toggle"
                  onClick={() => setAberto(aberto === 'regras' ? null : 'regras')}
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
                  <span style={{ fontFamily: SERIF, fontSize: 24, color: CORES.terra }}>
                    Por que essa resposta
                  </span>
                  <span style={{ fontSize: 14, color: CORES.cinza }}>
                    {regras.length} regras aplicadas
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 14, color: CORES.verde }}>
                    {aberto === 'regras' ? 'fechar' : 'abrir'}
                  </span>
                </button>

                {aberto === 'regras' && (
                  <ol
                    style={{
                      margin: 0,
                      padding: '0 0 22px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 20,
                    }}
                  >
                    {regras.map((r) => (
                      <li key={r.dispositivo} style={{ fontSize: 16, lineHeight: 1.5 }}>
                        <span>{r.texto}</span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 5,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontFamily: MONO, fontSize: 13, color: CORES.cinza }}>
                            {r.dispositivo}
                          </span>
                          {r.aConferir && (
                            <span
                              style={{
                                fontSize: 11,
                                letterSpacing: '.06em',
                                textTransform: 'uppercase',
                                color: CORES.terraClara,
                                border: '1px solid #D8C09A',
                                padding: '2px 7px',
                              }}
                            >
                              a conferir
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <button
                type="button"
                className="pc-primario"
                style={{ ...s.primario, alignSelf: 'flex-start', marginTop: 44 }}
              >
                Exportar parecer em PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
