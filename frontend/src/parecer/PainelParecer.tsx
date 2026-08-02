/**
 * ESCOPO F — o parecer na tela.
 *
 * Tudo aqui é leitura de `Parecer`. Nenhuma regra, limiar ou órgão está
 * escrito neste arquivo: se a tela mostra, o motor disse. É o que permite
 * trocar a base de regras (C.4) sem tocar em uma linha de interface.
 *
 * ⚠️ A seção de procedência ("por quê?" — as quatro etapas de `Caminho`, com
 * o rastro regra a regra e os fundamentos) foi REMOVIDA em 902d37b: o commit
 * apagou o componente `Caminho` e o ponto onde ele era montado, deixando para
 * trás só os auxiliares (`Etapa`, `Regra`, `Fonte`, `Vazio`) e uma docstring
 * órfã. Os auxiliares saíram junto agora, porque `noUnusedLocals` travava
 * `npm run build` — mas o dado continua todo em `Parecer` (`rastro`,
 * `fatores_concorrentes`, `fatos`), e `fundamentosDoParecer()` em
 * `@/lib/motor` segue exportada e sem consumidor. Reconstruir a seção é
 * trabalho de interface, não de motor.
 */

import { useMemo } from 'react'

import type { Parecer, Severidade } from '@/lib/schemas'

import { CORES, SERIF, linkTel, nomeOrgao, telefoneDe } from './dados'
import { baixarPedidoLai, linkEmailOrgao } from './lai'
import { s } from './ui'

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
              gridTemplateColumns: 'minmax(0, 1fr) auto auto',
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
            <a
              href={linkEmailOrgao(parecer, c.orgao, c.motivo)}
              className="pc-primario pc-nao-imprime"
              style={{
                ...s.primario,
                height: 40,
                padding: '0 16px',
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                borderBottom: 'none',
                color: CORES.branco,
              }}
            >
              Enviar email
            </a>
          </div>
        ))}
        <div style={{ fontSize: 12, color: CORES.cinzaClaro, marginTop: 10, lineHeight: 1.5 }}>
          Telefones de referência institucional, sem consulta registrada à fonte primária —
          confirmar antes de usar.
        </div>
      </div>
    </div>
  )
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
