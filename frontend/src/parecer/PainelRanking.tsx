/**
 * Painel de viabilidade de protocolo — a saída de `POST /api/ranking`.
 *
 * Fica ao lado do parecer de competência, não no lugar dele. As duas respostas
 * são diferentes e podem, legitimamente, discordar de ordem:
 *
 *   competência  quem PODE licenciar        UNIÃO > estado > município
 *   viabilidade  onde o protocolo ANDA      município > estado > federação
 *
 * O município aparecer em 1º aqui e a competência dizer ESTADUAL não é
 * contradição — é a diferença entre a lei e a fila. O cabeçalho do painel diz
 * isso, porque quem lê a tela pela primeira vez vai estranhar.
 *
 * Nada de limiar, órgão ou norma escrito aqui: se está na tela, veio do JSON
 * do backend. Mesma regra de método de `ParecerCompetencia.tsx`.
 */
import { useState } from 'react'

import type { InstanciaRanqueada, LeiRelacionada } from '@/lib/ranking-tipos'
import { useFormulario } from '@/state/formulario'

import { CORES } from './dados'
import { Aviso, Etiqueta, s } from './ui'

const COR_CONFIANCA: Record<string, string> = {
  alta: CORES.verde,
  media: CORES.terraClara,
  baixa: CORES.vermelho,
}

/** Trecho do ato com os termos casados marcados pelo FTS5 (`«` … `»`). */
function Trecho({ texto }: { texto: string }) {
  return (
    <span>
      {texto.split(/(«[^»]*»)/g).map((p, i) =>
        p.startsWith('«') ? (
          <mark key={i} style={{ background: CORES.linhaSuave, fontWeight: 600, padding: '0 2px' }}>
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

function Lei({ lei }: { lei: LeiRelacionada }) {
  const ato = lei.tipo === 'ato_diario_oficial'
  return (
    <li style={{ marginBottom: 10, lineHeight: 1.45 }}>
      <div style={{ fontSize: 14 }}>
        <strong>{lei.norma}</strong>
        {lei.dispositivo ? ` — ${lei.dispositivo}` : ''}
        {/* `verificado` é do schema e significa conferido contra a fonte
            primária. Nenhum dos 2.008 atos do diário foi — a etiqueta existe
            para a tela nunca passar excerto de diário por fundamento fechado. */}
        {!lei.verificado && (
          <span style={{ ...s.mono, marginLeft: 8 }}>não conferido</span>
        )}
        {ato && lei.relevancia === 'alta' && (
          <span style={{ ...s.mono, marginLeft: 8, color: CORES.verde }}>
            casou substância
          </span>
        )}
      </div>
      {lei.transcricao && (
        <div style={{ ...s.mono, marginTop: 3, color: CORES.cinzaEscuro, lineHeight: 1.5 }}>
          {ato ? <Trecho texto={lei.transcricao} /> : lei.transcricao}
        </div>
      )}
      {lei.url && (
        <a href={lei.url} target="_blank" rel="noreferrer" style={{ ...s.mono, color: CORES.terra }}>
          fonte
        </a>
      )}
    </li>
  )
}

function Cartao({ inst }: { inst: InstanciaRanqueada }) {
  const [aberto, setAberto] = useState(false)
  const fora = inst.status === 'desclassificado'

  return (
    <div
      style={{
        border: `1px solid ${fora ? CORES.linha : CORES.linhaForte}`,
        background: fora ? 'transparent' : CORES.branco,
        opacity: fora ? 0.65 : 1,
        borderRadius: 6,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...s.secao, fontSize: 20, minWidth: 26 }}>
          {fora ? '—' : `${inst.posicao}º`}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17 }}>{inst.orgao}</div>
          <Etiqueta cor={CORES.cinza}>{inst.instancia}</Etiqueta>
        </div>
        <span style={{ ...s.mono, color: COR_CONFIANCA[inst.confianca] ?? CORES.cinza }}>
          {fora ? 'desclassificada' : `confiança ${inst.confianca}`}
        </span>
      </div>

      <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
        {inst.motivos.map((m) => (
          <li key={m.codigo} style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 4 }}>
            {m.texto}
            {m.fundamento && (
              <span style={{ ...s.mono, marginLeft: 6 }}>
                {m.fundamento.norma}, {m.fundamento.dispositivo}
                {!m.fundamento.verificado && ' · não conferido'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {inst.leis.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            style={{
              ...s.mono,
              background: 'none',
              border: 'none',
              padding: '8px 0 0',
              cursor: 'pointer',
              color: CORES.terra,
            }}
          >
            {aberto ? '▾' : '▸'} {inst.leis.length} norma(s) e ato(s)
          </button>
          {aberto && <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {inst.leis.map((l, i) => <Lei key={`${l.url ?? l.dispositivo}-${i}`} lei={l} />)}
          </ul>}
        </>
      )}

      <div style={{ ...s.mono, marginTop: 8, color: CORES.cinzaClaro }}>
        {inst.contatos.telefone ?? 'telefone não levantado'}
        {' · '}
        {inst.contatos.email ?? 'e-mail não levantado'}
      </div>
    </div>
  )
}

export default function PainelRanking() {
  const { ranking } = useFormulario()
  const { resultado, carregando } = ranking

  if (!resultado && carregando) {
    return <p style={s.mono}>consultando o backend…</p>
  }
  if (!resultado) return null

  if (resultado.estado === 'incompleto') {
    return <p style={s.mono}>{resultado.motivo}</p>
  }
  if (resultado.estado === 'indisponivel') {
    return <Aviso erro>{resultado.motivo}</Aviso>
  }

  const r = resultado.ranking
  return (
    <section style={{ ...s.fade, opacity: carregando ? 0.55 : 1 }}>
      <h2 style={s.secao}>Onde protocolar</h2>
      <p style={{ fontSize: 14, color: CORES.cinzaEscuro, lineHeight: 1.5, margin: '4px 0 14px' }}>
        Ordem de <strong>viabilidade</strong>, não de competência. O parecer ao lado diz quem tem
        competência legal; esta lista diz onde o protocolo tem mais chance de andar, considerando
        habilitação, licenças recentes e atos do diário oficial. As duas ordens podem divergir.
      </p>

      <div style={{ ...s.mono, marginBottom: 12 }}>
        {r.entrada.tipologia_codigo} · {r.entrada.faixa_porte} · potencial{' '}
        {r.entrada.potencial_poluidor} · {r.entrada.classe}
        {r.entrada.cobertura_ba < 0.99 && (
          <> · cobertura BA {(r.entrada.cobertura_ba * 100).toFixed(1)}%</>
        )}
      </div>

      {r.ranking.map((i) => <Cartao key={i.instancia} inst={i} />)}
      {r.desclassificados.map((i) => <Cartao key={i.instancia} inst={i} />)}

      {r.avisos.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ ...s.mono, cursor: 'pointer', color: CORES.terra }}>
            {r.avisos.length} limitação(ões) da base neste resultado
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {r.avisos.map((a) => (
              <li key={a} style={{ ...s.mono, lineHeight: 1.55, marginBottom: 6 }}>
                {a}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
