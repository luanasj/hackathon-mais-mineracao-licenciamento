/**
 * ESCOPO G.1 — pedido de acesso à informação a partir da lacuna do parecer.
 *
 * A limitação vira ação: quando o motor devolve INDETERMINADO por ausência de
 * fato, o que falta já está nomeado em `Parecer.fatos_faltantes`, com o
 * destinatário sugerido. O texto abaixo é montado desses campos — nada é
 * inventado aqui, e o que não se sabe aparece como pergunta, não como
 * afirmação.
 */

import type { Parecer, ValorFato } from '@/lib/schemas'

const DESTINATARIO_PADRAO =
  'Secretaria do Meio Ambiente do Estado da Bahia (SEMA-BA) — Coordenação de Gestão Ambiental Compartilhada'

function texto(v: ValorFato | undefined): string | null {
  if (v === undefined || v === null || v === '') return null
  if (Array.isArray(v)) return v.length ? v.join(', ') : null
  return String(v)
}

export function gerarPedidoLai(parecer: Parecer): string {
  const f = parecer.fatos
  const destinatario = parecer.fatos_faltantes.find((x) => x.destinatario_sugerido)
    ?.destinatario_sugerido ?? DESTINATARIO_PADRAO

  const contexto = [
    ['Processo ANM', texto(f.processo?.valor)],
    ['Titular', texto(f.titular?.valor)],
    ['Substância', texto(f.substancia?.valor)],
    ['Fase na ANM', texto(f.fase?.valor)],
    ['Municípios atingidos pela poligonal', texto(f.municipios?.valor)],
    ['Área da poligonal (ha)', texto(f.area_ha?.valor)],
  ].filter(([, v]) => v !== null)

  const perguntas = parecer.fatos_faltantes.map((x, i) => `${i + 1}. ${x.rotulo}?`)

  return [
    `A ${destinatario}`,
    '',
    'PEDIDO DE ACESSO À INFORMAÇÃO',
    'Fundamento: Lei 12.527/2011 (Lei de Acesso à Informação), arts. 10 e 11.',
    '',
    'Senhores,',
    '',
    'No curso da análise de competência para o licenciamento ambiental da',
    'atividade minerária abaixo identificada, não foi localizada informação',
    'pública suficiente para determinar o ente competente. Solicito, por isso,',
    'o fornecimento dos dados relacionados ao final.',
    '',
    'IDENTIFICAÇÃO DA ATIVIDADE',
    ...contexto.map(([k, v]) => `  ${k}: ${v}`),
    '',
    'INFORMAÇÕES SOLICITADAS',
    ...perguntas,
    '',
    'Requeiro ainda a indicação do ato normativo ou administrativo que embasa',
    'cada resposta, com a respectiva data de vigência, e o endereço eletrônico',
    'de publicação, quando houver.',
    '',
    'Prazo legal de resposta: 20 dias, prorrogáveis por 10, nos termos do',
    'art. 11, §§ 1º e 2º, da Lei 12.527/2011.',
    '',
    'Atenciosamente,',
    '',
    '_______________________________________',
    'Nome e qualificação do requerente',
    '',
    `Gerado em ${new Date(parecer.gerado_em).toLocaleString('pt-BR')} a partir do parecer`,
    `de competência (estado: ${parecer.estado}).`,
  ].join('\n')
}

/** Baixa o pedido como arquivo de texto. Zero rede — tudo acontece no cliente. */
export function baixarPedidoLai(parecer: Parecer) {
  const blob = new Blob([gerarPedidoLai(parecer)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pedido-lai.txt'
  a.click()
  URL.revokeObjectURL(url)
}
