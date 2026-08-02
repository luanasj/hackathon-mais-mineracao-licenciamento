/**
 * Busca de atos do diário oficial por relevância (FTS5), executada por requisição.
 *
 * Substitui a carga total no boot que `carregarAtosPorMunicipio()` fazia. O que
 * mudou não é a latência — 2.008 atos cabiam em memória sem esforço — é a
 * pergunta: antes era "este município tem ≥1 ato cujo RÓTULO DE COLETA não é
 * `cfem`?", agora é "quais atos deste município falam de licenciamento ambiental
 * DESTA substância?".
 *
 * O rótulo de coleta prediz mal o conteúdo (medido sobre os 2.008 atos):
 *
 *   rótulo                    atos   contêm vocabulário de licença
 *   licenciamento ambiental    551   204  (37%)
 *   extracao mineral           596    55  ( 9%)
 *   mineracao                  375    32  ( 9%)
 *   cfem                       486     2  (0,4%)
 *
 * O motor contava 1.522 atos como evidência (todos menos `cfem`); só 293 têm de
 * fato vocabulário de licenciamento. Por isso o filtro `termo <> 'cfem'` sai: a
 * busca no texto é ~5x mais seletiva e não depende de um rótulo lossy
 * (`scripts/build_dataset.py` guarda um único termo por URL, o primeiro em ordem
 * alfabética — e `cfem` vem primeiro).
 *
 * ⚠️ O que está sendo buscado NÃO são leis. São janelas de 500–526 caracteres
 * (mediana 505) recortadas em torno de um acerto de palavra dentro de uma edição
 * diária inteira; o texto completo mora em `txt_url` remoto e nunca foi baixado.
 * Ver os avisos emitidos em `ranking.ts`.
 */
import type { DatabaseSync } from 'node:sqlite'

import type { LeiRelacionada } from '@/lib/ranking-tipos'

/** Quantos atos voltam por consulta. Evidência é ilustrativa, não exaustiva. */
export const LIMITE_ATOS = 5

/**
 * EIXO A — vocabulário de licenciamento ambiental municipal.
 *
 * Constante e curto de propósito: são as formas como uma prefeitura baiana nomeia
 * o ato de licenciar. Frases entre aspas são busca de frase no FTS5; tokens soltos
 * são as siglas. `SEMMA`/`COMDEMA` entram porque em município pequeno o ato é
 * assinado pela secretaria ou pelo conselho e às vezes não repete "licença".
 *
 * Sem acento: o tokenizer usa `remove_diacritics 2`, então o índice guarda
 * `licenca`. Consultar com "licença" acentuada não casaria.
 */
export const VOCABULARIO_LICENCIAMENTO: readonly string[] = [
  '"licenca de operacao"',
  '"licenca ambiental"',
  '"licenca previa"',
  '"licenca de instalacao"',
  '"licenca simplificada"',
  '"licenca unificada"',
  '"dispensa de licenca"',
  '"autorizacao ambiental"',
  'LAO',
  'LAS',
  'LAU',
  'DLA',
  'COMDEMA',
  'SEMMA',
]

/**
 * Palavras que aparecem no nome das tipologias da CEPRAM sem serem substância:
 * conectivos, o uso industrial descrito no fim da linha e adjetivos de qualidade
 * ("Quartzo Leitoso", "Calcário Conchífero" — a substância é quartzo e calcário).
 *
 * Lista de exclusão, não de inclusão: quem decide o que é substância é o nome da
 * tipologia no banco, não uma curadoria escrita aqui. Mesma regra que
 * `research_pipeline/GOAL.md` §7.2 se impôs — derivação mecânica, override
 * explícito e visível quando não der.
 */
const PARAR = new Set(
  `dentre outras outros outro outra para a o as os e de da do das dos em no na com
   utilizadas utilizados utilizada producao beneficiamento associado britamento uso
   industrial nao especificado anteriormente etc materiais manufatura vidro
   vitrificacao esmaltacao industria optica eletronica revestimento agregados
   fertilizantes corretivos agricolas recursos hidricos ceramicos leitoso conchifero
   minerais minerio tipo demais substancias`.split(/\s+/),
)

function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Plural português regular. "areias" -> "areia", "fosfatos" -> "fosfato". */
function singular(t: string): string {
  return t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t
}

/**
 * EIXO B — termos de substância, derivados do nome da tipologia e da substância
 * do SIGMINE.
 *
 * `B3.1 "Areias, Arenoso, Cascalhos, Filitos"` -> `areia arenoso cascalho filito`
 * `"MINÉRIO DE URÂNIO"` -> `uranio`
 *
 * Devolve `[]` quando não sobra nada — o chamador então só usa o eixo A.
 */
export function termosDeSubstancia(
  nomeTipologia: string | null | undefined,
  substanciaSigmine?: string | null,
): string[] {
  const bruto = [nomeTipologia ?? '', substanciaSigmine ?? ''].join(', ')
  return [
    ...new Set(
      dobrar(bruto)
        .split(/[,()/]| e | ou /)
        .flatMap((p) => p.trim().split(/\s+/))
        .map((t) => t.replace(/[^a-z]/g, ''))
        .filter((t) => t.length >= 4 && !PARAR.has(t))
        .map(singular)
        .filter((t) => !PARAR.has(t)),
    ),
  ]
}

/**
 * Monta uma disjunção FTS5. Termos já vêm dobrados e sem caractere especial de
 * `termosDeSubstancia`; o vocabulário de licenciamento é constante e escrito à
 * mão. Ainda assim, tudo que não for token simples ou frase entre aspas é
 * descartado — consulta FTS5 malformada lança, e um `MATCH` que explode derruba
 * a requisição inteira por causa de evidência opcional.
 */
export function montarDisjuncao(termos: readonly string[]): string {
  const seguros = termos.filter((t) => /^"[a-z0-9 -]+"$/.test(t) || /^[a-zA-Z0-9]+$/.test(t))
  return seguros.join(' OR ')
}

export interface ConsultaAtos {
  /** Nome da tipologia, para derivar o eixo B. */
  nomeTipologia: string | null
  /** Substância do SIGMINE, quando o processo a trouxer. */
  substancia?: string | null
  limite?: number
}

export type BuscadorAtos = (codigoIbge: string, consulta: ConsultaAtos) => LeiRelacionada[]

/**
 * Dois níveis, nesta ordem:
 *
 *   alta  — (eixo A) AND (eixo B): fala de licenciamento DAQUELA substância
 *   media — (eixo A):              fala de licenciamento, substância não confirmada
 *
 * Sem terceiro nível por substância sozinha: "areia" num diário municipal casa
 * obra pública, licitação de aterro e ata de sessão. Sem vocabulário de licença
 * junto, não é evidência de capacidade licenciatória.
 *
 * Ordenação `bm25 ASC, data_ato DESC`: no SQLite o BM25 é negativo e menor é
 * melhor. O desempate por data importa porque o corpus vai de 2004 a 2026 e não
 * há controle de revogação — entre dois atos igualmente relevantes, o recente
 * tem mais chance de estar vigente.
 */
export function criarBuscadorAtos(db: DatabaseSync): BuscadorAtos {
  const consulta = db.prepare(
    `SELECT a.url, a.data_ato, a.termo, a.confirmado_manualmente,
            bm25(ato_fts) AS score,
            snippet(ato_fts, 0, '«', '»', '…', 24) AS trecho
     FROM ato_fts
     JOIN ato_diario_oficial a ON a.id = ato_fts.rowid
     WHERE ato_fts MATCH ? AND a.codigo_ibge = ?
     ORDER BY bm25(ato_fts), a.data_ato DESC
     LIMIT ?`,
  )

  return (codigoIbge, { nomeTipologia, substancia, limite = LIMITE_ATOS }) => {
    const eixoA = montarDisjuncao(VOCABULARIO_LICENCIAMENTO)
    const substancias = termosDeSubstancia(nomeTipologia, substancia)
    const eixoB = montarDisjuncao(substancias)

    const tentativas: { expressao: string; relevancia: 'alta' | 'media'; termos: string[] }[] = []
    if (eixoB) {
      tentativas.push({
        expressao: `(${eixoA}) AND (${eixoB})`,
        relevancia: 'alta',
        termos: substancias,
      })
    }
    tentativas.push({ expressao: `(${eixoA})`, relevancia: 'media', termos: [] })

    for (const { expressao, relevancia, termos } of tentativas) {
      const linhas = consulta.all(expressao, codigoIbge, limite) as unknown as {
        url: string
        data_ato: string | null
        termo: string
        confirmado_manualmente: number
        score: number
        trecho: string
      }[]
      if (linhas.length === 0) continue

      return linhas.map((r) => ({
        tipo: 'ato_diario_oficial' as const,
        norma: 'Ato publicado em diário oficial municipal',
        dispositivo: r.data_ato ? `Edição de ${r.data_ato}` : 'Edição sem data confiável',
        transcricao: r.trecho,
        url: r.url,
        // Nenhum dos 2.008 foi conferido à mão; o campo existe para a tela não
        // tratar excerto de diário como fundamento fechado.
        verificado: r.confirmado_manualmente === 1,
        termo_encontrado: r.termo,
        data: r.data_ato,
        relevancia,
        bm25: Number(r.score.toFixed(4)),
        termos_consultados: relevancia === 'alta' ? termos : [],
      }))
    }
    return []
  }
}
