/**
 * ESCOPO F — o parecer na tela.
 *
 * Tudo aqui é leitura de `Parecer`. Nenhuma regra, limiar ou órgão está
 * escrito neste arquivo: se a tela mostra, o motor disse. É o que permite
 * trocar a base de regras (C.4) sem tocar em uma linha de interface.
 *
 * A procedência não é um apêndice: as quatro etapas de `Caminho` são a
 * resposta à pergunta "por que isso?", na ordem em que uma pessoa a faria —
 * o que se sabe, o que a norma pergunta, quem venceu, com base em quê.
 */

import { useMemo, useState } from 'react'

import { rotuloFato } from '@/lib/fatos'
import { fundamentosDoParecer } from '@/lib/motor'
import { ROTULO_FAIXA } from '@/lib/porte'
import type { Fundamento, Parecer, PassoRastro, Severidade, ValorFato } from '@/lib/schemas'

import { CORES, MONO, ROTULO_INSTANCIA, SERIF, fmt2, linkTel, nomeOrgao, telefoneDe } from './dados'
import { baixarPedidoLai } from './lai'
import { Pendente, s } from './ui'

const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  info: 'informação',
  atencao: 'atenção',
  critico: 'crítico',
}

/** Cor nunca carrega a informação sozinha (E.6/F.6) — sempre acompanha texto. */
const COR_SEVERIDADE: Record<Severidade, string> = {
  info: CORES.cinza,
  atencao: CORES.terraClara,
  critico: CORES.vermelho,
}

export interface PainelParecerProps {
  parecer: Parecer
  temArea: boolean
  municipioPrincipal: string | null
}

export default function PainelParecer({
  parecer,
  temArea,
  municipioPrincipal,
}: PainelParecerProps) {
  const contatos = useMemo(
    () => contatosDe(parecer, municipioPrincipal),
    [parecer, municipioPrincipal],
  )

  if (!temArea) {
    return (
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
          Busque o processo da ANM ou desenhe a poligonal para gerar o parecer.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {parecer.alertas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
          {parecer.alertas.map((a) => (
            <div
              key={a.id}
              style={{
                borderLeft: `3px solid ${COR_SEVERIDADE[a.severidade]}`,
                paddingLeft: 14,
              }}
            >
              <div
                style={{
                  ...s.etiqueta,
                  fontSize: 11,
                  color: COR_SEVERIDADE[a.severidade],
                }}
              >
                {ROTULO_SEVERIDADE[a.severidade]}
              </div>
              <div style={{ fontSize: 17, marginTop: 6 }}>{a.titulo}</div>
              <div style={{ fontSize: 15, color: CORES.cinzaEscuro, marginTop: 4, lineHeight: 1.55 }}>
                {a.detalhe}
              </div>
            </div>
          ))}
        </div>
      )}

      {parecer.fatos_faltantes.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <div style={s.secao}>O que falta para concluir</div>
          <ol
            style={{
              margin: '14px 0 0',
              padding: '0 0 0 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {parecer.fatos_faltantes.map((f) => (
              <li key={f.chave} style={{ fontSize: 16, lineHeight: 1.5 }}>
                {f.rotulo}
                {f.destinatario_sugerido && (
                  <div style={{ fontSize: 13, color: CORES.cinza, marginTop: 4 }}>
                    Pedir a: {f.destinatario_sugerido}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="pc-primario"
            onClick={() => baixarPedidoLai(parecer)}
            style={{ ...s.primario, marginTop: 20 }}
          >
            Gerar pedido de acesso à informação
          </button>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={s.secao}>Para quem ligar</div>
        {contatos.map((c) => (
          <div
            key={c.orgao}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 24,
              alignItems: 'center',
              padding: '18px 0',
              borderTop: `1px solid ${CORES.linhaSuave}`,
            }}
          >
            <div>
              <div style={{ fontSize: 18 }}>{c.orgao}</div>
              <div style={{ fontSize: 13, color: CORES.cinza, marginTop: 3 }}>{c.motivo}</div>
            </div>
            {c.telefone === '—' ? (
              <span style={{ fontSize: 14, color: CORES.cinzaClaro, whiteSpace: 'nowrap' }}>
                telefone não levantado
              </span>
            ) : (
              <a
                href={linkTel(c.telefone)}
                style={{
                  fontFamily: SERIF,
                  fontSize: 26,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  padding: '6px 0',
                  display: 'inline-block',
                }}
              >
                {c.telefone}
              </a>
            )}
          </div>
        ))}
        <div style={{ fontSize: 12, color: CORES.cinzaClaro, marginTop: 10, lineHeight: 1.5 }}>
          Telefones de referência institucional, sem consulta registrada à fonte primária —
          confirmar antes de usar.
        </div>
      </div>


      <button
        type="button"
        className="pc-primario pc-nao-imprime"
        onClick={() => window.print()}
        style={{ ...s.primario, alignSelf: 'flex-start', marginTop: 40 }}
      >
        Exportar parecer em PDF
      </button>

      <div style={{ ...s.mono, fontSize: 12, marginTop: 22, lineHeight: 1.7 }}>
        schema {parecer.schema_versao} · gerado em{' '}
        {new Date(parecer.gerado_em).toLocaleString('pt-BR')}
        {parecer.tem_fundamento_pendente && (
          <div style={{ marginTop: 8 }}>
            <Pendente texto="há fundamento não conferido nesta cadeia" />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O caminho — quatro etapas, na ordem em que a pergunta "por quê?" se desdobra
// ---------------------------------------------------------------------------

/**
 * Substitui os três blocos independentes que existiam antes (rastro, fatores
 * concorrentes, fatos apurados). Eram os mesmos dados, mas soltos: quem abria
 * um não sabia que o outro existia, nem em que ordem lê-los. Aqui a numeração
 * declara a ordem, e o resumo de cada etapa é legível sem abrir nada.
 */


/**
 * Uma etapa do caminho. O trilho vertical à esquerda é o que faz as quatro
 * lerem como sequência e não como quatro acordeões empilhados.
 */
function Etapa({
  n,
  titulo,
  resumo,
  alerta = false,
  aberta,
  aoAlternar,
  ultima,
  children,
}: {
  n: number
  titulo: string
  resumo: string
  alerta?: boolean
  aberta: boolean
  aoAlternar: () => void
  ultima: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `1px solid ${aberta ? CORES.verde : CORES.linhaForte}`,
            background: aberta ? CORES.verde : 'transparent',
            color: aberta ? CORES.branco : CORES.terra,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: SERIF,
            fontSize: 15,
            marginTop: 14,
          }}
        >
          {n}
        </div>
        {!ultima && <div style={{ flex: 1, width: 1, background: CORES.linha, marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0, borderBottom: ultima ? 'none' : `1px solid ${CORES.linhaSuave}` }}>
        <button
          type="button"
          className="pc-toggle"
          onClick={aoAlternar}
          aria-expanded={aberta}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 12,
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '16px 0',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 17 }}>{titulo}</span>
          <span style={{ fontSize: 14, color: CORES.cinza }}>{resumo}</span>
          {alerta && <Pendente />}
          <span className="pc-nao-imprime" style={{ marginLeft: 'auto', fontSize: 14, color: CORES.verde }}>
            {aberta ? 'ocultar' : 'ver'}
          </span>
        </button>
        {/* Sempre no DOM, escondido por estilo: no papel o parecer tem de sair
            com a cadeia inteira, e uma etapa fechada na tela não pode virar
            fundamento omitido no PDF. `@media print` reabre todas. */}
        <div
          className="pc-etapa-detalhe"
          style={{ padding: '2px 0 22px', display: aberta ? 'block' : 'none' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** Uma regra do rastro, com os predicados que a fizeram passar ou parar. */
function Regra({ passo }: { passo: PassoRastro }) {
  return (
    <div style={{ fontSize: 16, lineHeight: 1.5, opacity: passo.disparou ? 1 : 0.55 }}>
      <div>
        {passo.descricao}
        <span
          style={{
            fontSize: 13,
            color: passo.disparou ? CORES.verde : CORES.cinza,
            marginLeft: 8,
          }}
        >
          {passo.disparou ? 'disparou' : 'não disparou'}
        </span>
      </div>

      <ul
        style={{
          margin: '8px 0 0',
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {passo.avaliacoes.map((a, i) => (
          <li key={`${a.predicado.fato}-${i}`} style={{ ...s.mono, fontSize: 12.5 }}>
            {a.resultado ? '✓' : '✕'} {a.predicado.negado ? 'não ' : ''}
            {a.predicado.fato} {a.predicado.operador}
            {a.predicado.valor !== undefined && ` ${formatar(a.predicado.valor as ValorFato)}`}
            {' → '}
            {formatar(a.valor_observado)}
          </li>
        ))}
      </ul>

      <Fonte fundamento={passo.fundamento} />
    </div>
  )
}

function Fonte({ fundamento }: { fundamento: Fundamento }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 6,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 13, color: CORES.cinza }}>
        {fundamento.norma}, {fundamento.dispositivo}
      </span>
      {!fundamento.verificado && <Pendente />}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, color: CORES.cinza, lineHeight: 1.55, maxWidth: 560 }}>
      {children}
    </div>
  )
}

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return dia ? `${dia}/${mes}/${ano}` : iso
}

function formatar(v: ValorFato): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'number') return fmt2(v)
  return ROTULO_FAIXA[v as keyof typeof ROTULO_FAIXA] ?? v
}

// ---------------------------------------------------------------------------
// Lista telefônica derivada do parecer
// ---------------------------------------------------------------------------

interface ContatoDerivado {
  orgao: string
  telefone: string
  motivo: string
}

/**
 * Quem entra na lista é consequência do parecer, não uma constante: o órgão
 * competente vem de `parecer.orgao`, e os acessórios vêm dos fatos que o
 * usuário declarou. Trocar a regra troca a lista.
 *
 * TODO: nomes de órgão abaixo (ex. "INEMA — Licenciamento") ainda são
 * literais no código — não há tabela de contatos institucionais no schema
 * (`documentation/schema.sql`). `telefone` já vem de `telefoneDe`, que é o
 * ponto único a trocar por consulta ao banco quando a tabela existir; os
 * nomes deveriam migrar para lá junto.
 */
function contatosDe(parecer: Parecer, municipio: string | null): ContatoDerivado[] {
  const lista: ContatoDerivado[] = []
  const f = parecer.fatos

  switch (parecer.orgao) {
    case 'IBAMA':
      lista.push({
        orgao: 'IBAMA — Superintendência na Bahia',
        telefone: telefoneDe('IBAMA — Superintendência na Bahia'),
        motivo: 'órgão licenciador — competência federal',
      })
      break
    case 'INEMA':
      lista.push({
        orgao: 'INEMA — Licenciamento',
        telefone: telefoneDe('INEMA — Licenciamento'),
        motivo: 'órgão licenciador — competência estadual',
      })
      break
    case 'MUNICIPIO':
      lista.push({
        orgao: nomeOrgao('MUNICIPIO', municipio),
        telefone: '—',
        motivo: 'órgão licenciador — competência municipal',
      })
      break
    default:
      lista.push({
        orgao: 'SEMA-BA — Gestão Ambiental Compartilhada',
        telefone: telefoneDe('SEMA-BA — Gestão Ambiental Compartilhada'),
        motivo: 'competência indeterminada — é quem responde pela habilitação municipal',
      })
  }

  if (f.supressao_vegetacao?.valor === true) {
    lista.push({
      orgao: 'INEMA — Florestas e Biodiversidade',
      telefone: telefoneDe('INEMA — Florestas e Biodiversidade'),
      motivo: 'supressão de vegetação declarada — Autorização de Supressão (ASV)',
    })
  }

  const hidrico = f.recurso_hidrico?.valor
  if (Array.isArray(hidrico) && hidrico.length > 0) {
    lista.push({
      orgao: 'INEMA — Recursos Hídricos',
      telefone: telefoneDe('INEMA — Recursos Hídricos'),
      motivo: `interferência declarada: ${hidrico.join(', ')} — outorga`,
    })
  }

  if (f.explosivos?.valor === true) {
    lista.push({
      orgao: 'Exército — SFPC/6',
      telefone: telefoneDe('Exército — SFPC/6'),
      motivo: 'uso de explosivos declarado — registro de produto controlado',
    })
  }

  lista.push({
    orgao: 'ANM — Gerência Regional na Bahia',
    telefone: telefoneDe('ANM — Gerência Regional na Bahia'),
    motivo: 'titularidade e fase do processo minerário',
  })
  lista.push({
    orgao: 'IPHAN — Superintendência na Bahia',
    telefone: telefoneDe('IPHAN — Superintendência na Bahia'),
    motivo: 'manifestação sobre patrimônio arqueológico',
  })

  return lista
}
