/**
 * Tipos do motor de ranking de instâncias — a saída de `ranking.ts`.
 *
 * Vive aqui, e não em `frontend/src/lib/schemas.ts`, porque aquele arquivo é
 * contrato congelado (0.2): nenhum tipo novo entra depois do congelamento.
 * `Fundamento` é importado de lá porque é transversal — toda afirmação
 * normativa do produto carrega o mesmo formato de fundamento, e duplicar esse
 * tipo faria a tela ter de saber de qual dos dois ele veio.
 *
 * ⚠️ Isto NÃO substitui o motor de competência (`frontend/src/lib/motor.ts`).
 * As duas engines respondem perguntas diferentes:
 *   motor.ts   — "quem TEM competência legal?"  (precedência UNIÃO > EST > MUN)
 *   ranking.ts — "onde tenho mais CHANCE de protocolar com sucesso?"
 *                (prioridade padrão MUNICÍPIO > ESTADO > FEDERAÇÃO)
 * A segunda consulta a primeira como trava (ver `ranking.ts`, passo 0).
 */
import type { Fundamento } from '@/lib/schemas'

/**
 * As três instâncias ranqueadas. Nomes deliberadamente diferentes de
 * `Instancia` do schema congelado (`UNIAO`/`ESTADUAL`/`MUNICIPAL`/
 * `INDETERMINADA`): aqui não existe `INDETERMINADA` — uma instância ou está no
 * ranking ou está desclassificada, e a distinção precisa ser visível no tipo.
 */
export type Instancia3 = 'MUNICIPAL' | 'ESTADUAL' | 'FEDERAL'

/** Grau de sustentação da posição, não probabilidade calculada. */
export type Confianca = 'alta' | 'media' | 'baixa'

/**
 * Um motivo é sempre um par (código estável, texto legível). O código existe
 * para a tela e os testes casarem sem depender da redação; o texto existe
 * porque o produto tem de explicar, não só classificar.
 */
export interface Motivo {
  codigo: MotivoCodigo
  texto: string
  fundamento?: Fundamento
}

export type MotivoCodigo =
  // desclassificações
  | 'competencia_federal_absoluta'
  | 'poligonal_em_dois_estados'
  | 'poligonal_em_dois_municipios'
  | 'municipio_nao_habilitado'
  | 'municipio_sem_nivel'
  | 'tipologia_nao_delegada_ao_nivel'
  | 'classe_acima_do_nivel'
  // classificações
  | 'competencia_delegada_confirmada'
  | 'licenciou_por_conta_propria'
  | 'consorcio_com_licenciamento_recente'
  | 'sem_evidencia_de_licenciamento'
  | 'competencia_remanescente_do_estado'
  | 'competencia_supletiva_federal'
  // evidência documental (nunca desclassifica — só move confiança)
  | 'atos_locais_encontrados'
  | 'sem_atos_locais_encontrados'

/** Uma lei/ato devolvido para a instância. Superset de `Fundamento`. */
export interface LeiRelacionada extends Fundamento {
  /** `norma` para peça normativa; `ato_diario_oficial` para evidência local. */
  tipo: 'norma' | 'ato_diario_oficial'
  /** Só em atos do diário: rótulo do termo que casou na COLETA (lossy). */
  termo_encontrado?: string
  /** Só em atos do diário: data do ato, ISO 8601. */
  data?: string | null
  /**
   * Só em atos do diário. `alta` = o texto casou vocabulário de licenciamento
   * **e** a substância da tipologia; `media` = só o vocabulário de licenciamento.
   */
  relevancia?: 'alta' | 'media'
  /** Só em atos do diário: BM25 do SQLite. Negativo, menor = mais relevante. */
  bm25?: number
  /** Só em `relevancia: 'alta'`: os termos de substância que a consulta usou. */
  termos_consultados?: string[]
}

/**
 * Contato de uma instância. Todo campo é anulável de propósito: o projeto não
 * levantou contato municipal nenhum, e devolver `''` ou um placeholder
 * plausível seria inventar dado. `motivo` explica o `null`.
 */
export interface Contato {
  orgao: string
  telefone: string | null
  email: string | null
  /** Conferido contra a fonte primária. Hoje sempre `false` (ver dados.ts). */
  verificado: boolean
  motivo?: string
  /** Quando não há contato, o produto sabe pedir — é o gerador LAI (G.1). */
  acao_sugerida?: 'gerar_pedido_lai'
}

export interface InstanciaRanqueada {
  instancia: Instancia3
  orgao: string
  /** 1, 2, 3… — `null` quando desclassificada. */
  posicao: number | null
  status: 'ranqueado' | 'desclassificado'
  confianca: Confianca
  motivos: Motivo[]
  leis: LeiRelacionada[]
  contatos: Contato
}

/** Um município atingido pela poligonal, com a proporção de área nele. */
export interface IncidenciaEntrada {
  cd_mun: string
  nm_mun: string
  /** Fração da poligonal dentro deste município, 0–1. */
  proporcao: number
}

export interface EntradaRanking {
  /** Nº do processo ANM, quando a origem foi busca e não desenho. */
  processo: string | null
  municipios: IncidenciaEntrada[]
  /** Código CEPRAM da tipologia. Ex.: "B3.1". */
  tipologia_codigo: string
  /** Produção bruta declarada, na unidade da tipologia (t/ano). */
  producao: number
  /** Substância do SIGMINE — alimenta a trava de competência federal. */
  substancia?: string
  /** ISO 8601. Default: hoje. Parametrizável para os testes não envelhecerem. */
  data_referencia?: string
}

/** Eco da entrada já derivada, para a tela não recalcular nada. */
export interface EntradaResolvida {
  processo: string | null
  municipios: IncidenciaEntrada[]
  /** Σ proporcao. < 1 significa que parte da poligonal está fora da Bahia. */
  cobertura_ba: number
  tipologia_codigo: string
  tipologia_nome: string
  producao: number
  unidade_porte: string
  faixa_porte: string
  potencial_poluidor: string
  /** "Classe 1".."Classe 6", do cruzamento porte × potencial (Art. 3º). */
  classe: string
  data_referencia: string
}

export interface RankingInstancias {
  schema_versao: '1.0.0'
  gerado_em: string
  entrada: EntradaResolvida
  /** Ordenado por `posicao` crescente. */
  ranking: InstanciaRanqueada[]
  desclassificados: InstanciaRanqueada[]
  /**
   * Limitações da base que afetam ESTE resultado. Vão na saída, não em
   * comentário de código: quem lê o ranking tem de ver o que ele não sabe.
   */
  avisos: string[]
}
