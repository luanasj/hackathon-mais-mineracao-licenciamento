/**
 * ESCOPO 0.2 — CONTRATO CONGELADO
 *
 * Os quatro schemas do projeto. Todo escopo importa daqui.
 * Regra de método: nenhum campo novo entra depois do congelamento — se um
 * escopo precisar de um campo que não existe, a conversa é sobre o contrato,
 * não sobre o arquivo que o consome.
 *
 * Convenção transversal: toda afirmação normativa carrega `Fundamento`, e todo
 * `Fundamento` carrega `verificado`. Interface é obrigada a marcar visualmente
 * o que ainda não foi conferido contra a fonte primária (C.6 / F.3).
 */

// ---------------------------------------------------------------------------
// Vocabulário compartilhado
// ---------------------------------------------------------------------------

/** Quem licencia. Ordem de precedência em `PRECEDENCIA`. */
export type Instancia = 'UNIAO' | 'ESTADUAL' | 'MUNICIPAL' | 'INDETERMINADA'

/** Órgão concreto por trás da instância. */
export type Orgao = 'IBAMA' | 'INEMA' | 'MUNICIPIO' | 'ANM' | 'INDETERMINADO'

/**
 * Precedência numérica usada por D.3. A regra de maior peso decide; as demais
 * sobrevivem no parecer como fatores concorrentes, nunca são descartadas.
 */
export const PRECEDENCIA: Record<Instancia, number> = {
  UNIAO: 100,
  ESTADUAL: 60,
  MUNICIPAL: 30,
  INDETERMINADA: 0,
} as const

/** Faixas de porte da CEPRAM 4.420/2015 — função degrau, não contínua. */
export type FaixaPorte =
  | 'micro'
  | 'pequeno'
  | 'medio'
  | 'grande'
  | 'excepcional'

export const FAIXAS_PORTE: readonly FaixaPorte[] = [
  'micro',
  'pequeno',
  'medio',
  'grande',
  'excepcional',
] as const

/** Potencial poluente/degradador da tipologia. */
export type PotencialPoluente = 'pequeno' | 'medio' | 'grande'

/** Modalidades de licença. `trifasico` é a sequência LP → LI → LO. */
export type ModalidadeTrilha = 'trifasico' | 'LU' | 'LAC' | 'LAE' | 'DISPENSA'

/** Etapas individuais dentro de uma trilha. */
export type TipoLicenca = 'LP' | 'LI' | 'LO' | 'LU' | 'LAC' | 'LAE'

/** Fase do processo minerário no SIGMINE/ANM. */
export type FaseANM = string

/** Três estados de conclusão do motor (D.5). Ausência de fato nunca vira chute. */
export type EstadoParecer = 'DEFINIDA' | 'CONDICIONAL' | 'INDETERMINADO'

/** Severidade de alerta. Cor nunca carrega a informação sozinha (E.6/F.6). */
export type Severidade = 'info' | 'atencao' | 'critico'

// ---------------------------------------------------------------------------
// Fundamento — a unidade de procedência
// ---------------------------------------------------------------------------

/**
 * Citação de dispositivo normativo. Obrigatória em toda regra e em toda
 * afirmação exibida na tela.
 *
 * `verificado: false` não impede a exibição — obriga a marcação de pendência.
 * É a diferença entre "o sistema afirma" e "o sistema afirma e conferiu".
 */
export interface Fundamento {
  /** Norma. Ex.: "Resolução CEPRAM 4.420/2015" */
  norma: string
  /** Dispositivo dentro da norma. Ex.: "Anexo Único, item 3.2" */
  dispositivo: string
  /** Transcrição literal do trecho aplicável, quando houver. */
  transcricao?: string
  /** URL da fonte primária consultada. */
  url?: string
  /** Conferido contra a fonte primária por um humano (C.6). */
  verificado: boolean
  /** Data da conferência, ISO 8601 (YYYY-MM-DD). */
  data_conferencia?: string
}

/** Procedência de um dado coletado — vai junto de todo dado exibido (F). */
export interface Procedencia {
  fonte: string
  url?: string
  /** ISO 8601 (YYYY-MM-DD). */
  data_consulta: string
  /** Caminho no repo da captura de tela arquivada, quando houver. */
  captura?: string
}

// ---------------------------------------------------------------------------
// SCHEMA 1 — Tipologia (Base A, alimentada por C.1)
// ---------------------------------------------------------------------------

/**
 * Uma faixa de porte concreta de uma tipologia. As fronteiras são o insumo
 * de D.4: o motor reavalia exatamente sobre elas para achar o limiar de virada.
 *
 * Intervalo fechado embaixo, aberto em cima: [min, max). `max: null` = ilimitado.
 */
export interface FaixaTipologia {
  faixa: FaixaPorte
  /** Limite inferior, inclusivo, na unidade do parâmetro da tipologia. */
  min: number
  /** Limite superior, exclusivo. `null` quando a faixa é o topo. */
  max: number | null
}

/**
 * Uma linha do grupo de mineração do Anexo Único da Resolução CEPRAM
 * 4.420/2015. É o que o usuário escolhe no seletor B.1.
 */
export interface Tipologia {
  /** Identificador estável interno. Ex.: "lavra-ceu-aberto-sem-benef" */
  id: string
  /** Código da tipologia na resolução, quando existir. */
  codigo: string | null
  /** Nome da atividade como está na norma. */
  atividade: string
  /** Grupo/divisão do anexo. Ex.: "Divisão B — Mineração" */
  grupo: string
  /** Nome do parâmetro que mede o porte. Ex.: "produção bruta" */
  parametro_porte: string
  /** Unidade do parâmetro. Ex.: "t/ano", "ha", "m³/ano" */
  unidade_porte: string
  /** Faixas ordenadas por `min` crescente, sem lacuna nem sobreposição. */
  faixas: FaixaTipologia[]
  potencial_poluente: PotencialPoluente
  /**
   * Campos condicionais do formulário que esta tipologia ativa (B.5).
   * Ex.: ['supressao_vegetacao', 'recurso_hidrico', 'explosivos']
   */
  campos_condicionais: string[]
  fundamento: Fundamento
}

// ---------------------------------------------------------------------------
// SCHEMA 2 — MunicipioHabilitacao (Base B, alimentada por C.2)
// ---------------------------------------------------------------------------

/**
 * `sem_evidencia` é um estado válido e desejado do produto, não uma falha de
 * coleta: leva a INDETERMINADO e aciona o gerador de pedido LAI (Escopo G).
 */
export type StatusHabilitacao = 'habilitado' | 'nao_habilitado' | 'sem_evidencia'

/**
 * Dossiê de habilitação de um município para gestão ambiental compartilhada.
 * Uma linha por município da amostra. Toda linha precisa sustentar a pergunta
 * "qual é a fonte disto?" respondida na hora.
 */
export interface MunicipioHabilitacao {
  /** Código IBGE de 7 dígitos. Chave de junção com a malha. */
  cd_mun: string
  /** Nome conforme a malha IBGE 2025. Ex.: "Santaluz" (uma palavra). */
  nm_mun: string
  status: StatusHabilitacao
  /**
   * Nível/classe de habilitação conforme publicado pelo Estado.
   * Texto livre porque o vocabulário oficial é fixado por C.2, não aqui.
   * `null` quando não habilitado ou sem evidência.
   */
  nivel: string | null
  /** IDs de `Tipologia` efetivamente delegadas ao município. */
  tipologias_delegadas: string[]
  /**
   * Ato normativo/administrativo que concedeu a habilitação, quando existir.
   */
  ato: string | null
  /** Data de vigência do ato, ISO 8601. */
  vigencia_desde: string | null
  procedencia: Procedencia
  /** Observação do transcritor. Aparece no painel "por quê?". */
  observacao?: string
}

// ---------------------------------------------------------------------------
// SCHEMA 3 — Regra (Base C, alimentada por C.4)
// ---------------------------------------------------------------------------

/** Operadores suportados pelo avaliador de predicados (D.2). */
export type Operador =
  | 'igual'
  | 'em'
  | 'contem'
  | 'maior'
  | 'menor'
  | 'entre'
  | 'existe'

/** Valor que um fato pode assumir no FactBase. */
export type ValorFato = string | number | boolean | string[] | null

/**
 * Uma condição atômica. `fato` é a chave no FactBase — nenhuma regra lê o
 * formulário direto (D.1).
 */
export interface Predicado {
  fato: string
  operador: Operador
  /** `entre` espera [min, max]. `existe` ignora este campo. */
  valor?: ValorFato | [number, number]
  /** Inverte o resultado do predicado. */
  negado?: boolean
}

/**
 * Regra de competência. Todas as condições precisam ser verdadeiras (AND).
 * Disjunção se expressa como duas regras — deliberado, para que cada caminho
 * apareça separado no rastro de execução.
 */
export interface Regra {
  id: string
  /** Frase curta legível, exibida no painel "por quê?". */
  descricao: string
  condicoes: Predicado[]
  /** Conclusão da regra. */
  efeito: {
    instancia: Instancia
    orgao: Orgao
    /** Sobrescreve `PRECEDENCIA[instancia]` quando a norma exige. */
    precedencia?: number
    /** Trilhas que esta regra torna elegíveis. */
    trilhas_elegiveis?: ModalidadeTrilha[]
    /** IDs de `Anuencia` disparadas. */
    anuencias?: string[]
    /** Alertas emitidos junto com a conclusão. */
    alertas?: Omit<Alerta, 'origem_regra'>[]
  }
  /**
   * Regra que, disparando, torna a conclusão CONDICIONAL em vez de DEFINIDA
   * (ex.: poligonal cruzando divisa com status divergente).
   */
  torna_condicional?: boolean
  /**
   * Fato cuja ausência força INDETERMINADO. Quando presente e o fato não
   * existir no FactBase, a regra não conclui — ela declara a lacuna.
   */
  exige_fato?: string[]
  fundamento: Fundamento
  /** P0 = entra na demo. Usado para cortar base sem quebrar cenário. */
  prioridade?: 'P0' | 'P1' | 'P2'
}

/** Anuência acessória com gatilho próprio (C.7). */
export interface Anuencia {
  id: string
  nome: string
  orgao_anuente: string
  /** Condição de disparo, no mesmo vocabulário do FactBase. */
  gatilho: Predicado[]
  fundamento: Fundamento
}

/** Uma etapa de licença dentro de uma trilha, com prazo legal de análise. */
export interface EtapaTrilha {
  licenca: TipoLicenca
  /** Prazo legal MÁXIMO de análise, em dias. Nunca prazo observado (trava E.1). */
  prazo_analise_dias: number
  /** Estudos exigidos nesta etapa. Ex.: ["EIA/RIMA"] */
  estudos: string[]
  fundamento: Fundamento
}

/** Trilha de licenciamento completa (C.5). */
export interface Trilha {
  id: string
  modalidade: ModalidadeTrilha
  nome: string
  etapas: EtapaTrilha[]
  /** Condições que tornam esta trilha elegível. */
  elegibilidade: Predicado[]
  fundamento: Fundamento
}

// ---------------------------------------------------------------------------
// FactBase — a fronteira entre formulário e motor (D.1)
// ---------------------------------------------------------------------------

export type OrigemFato = 'declarado' | 'derivado' | 'cadastro'

export interface Fato {
  chave: string
  valor: ValorFato
  origem: OrigemFato
  /** De onde veio: "SIGMINE", "formulário", "spatial join A.3"... */
  procedencia?: Procedencia
}

/** Mapa chave → fato. O motor lê exclusivamente daqui. */
export type FactBase = Record<string, Fato>

// ---------------------------------------------------------------------------
// SCHEMA 4 — Parecer (saída do Escopo D, entrada de E, F e G)
// ---------------------------------------------------------------------------

export interface Alerta {
  id: string
  severidade: Severidade
  titulo: string
  detalhe: string
  /** ID da regra que emitiu. Fecha o rastro. */
  origem_regra: string
  fundamento?: Fundamento
}

/** Uma regra que disparou mas não venceu a precedência. */
export interface FatorConcorrente {
  regra_id: string
  descricao: string
  instancia: Instancia
  precedencia: number
  fundamento: Fundamento
}

/** Entrada do rastro de execução (D.6). Ordem = ordem de avaliação. */
export interface PassoRastro {
  ordem: number
  regra_id: string
  descricao: string
  disparou: boolean
  /** Predicado a predicado, para o painel "por quê?" abrir até o fim. */
  avaliacoes: {
    predicado: Predicado
    valor_observado: ValorFato
    resultado: boolean
  }[]
  fundamento: Fundamento
}

/**
 * Ponto exato em que a competência muda ao varrer o parâmetro de porte (D.4).
 * Alimenta o marcador de faixas (E.3) e o texto do limiar.
 */
export interface LimiarVirada {
  /** Valor do parâmetro na fronteira. */
  valor: number
  unidade: string
  faixa_abaixo: FaixaPorte
  faixa_acima: FaixaPorte
  instancia_abaixo: Instancia
  instancia_acima: Instancia
  fundamento: Fundamento
}

/** Uma opção comparável na análise do Escopo E. */
export interface OpcaoComparada {
  trilha_id: string
  modalidade: ModalidadeTrilha
  nome: string
  elegivel: boolean
  /** Por que não é elegível, quando `elegivel: false`. */
  motivo_inelegibilidade?: string
  /** Soma dos prazos legais máximos das etapas, em dias. */
  prazo_legal_total_dias: number
  n_etapas: number
  n_estudos: number
  n_anuencias: number
  fundamento: Fundamento
}

/**
 * Saída canônica do motor. Consumida sem adaptação pela interface (F),
 * pelo comparador (E) e pelo gerador de pedido LAI (G).
 */
export interface Parecer {
  /** Versão do schema — muda se o contrato mudar depois do congelamento. */
  schema_versao: '1.0.0'
  /** ISO 8601 completo. Timestamp visível na tela (F). */
  gerado_em: string

  estado: EstadoParecer
  instancia: Instancia
  orgao: Orgao

  /** Snapshot dos fatos que produziram este parecer. */
  fatos: FactBase

  /** Trilha recomendada quando há uma só elegível; `null` sob comparação. */
  trilha_selecionada: Trilha | null
  /** Todas as opções, elegíveis ou não, para a matriz comparativa (E.4). */
  opcoes: OpcaoComparada[]

  /** Soma dos prazos legais máximos da trilha selecionada, em dias. */
  prazo_legal_total_dias: number | null
  /** Quantidade de licenças da trilha selecionada. */
  n_licencas: number | null

  anuencias: Anuencia[]
  alertas: Alerta[]
  fatores_concorrentes: FatorConcorrente[]
  rastro: PassoRastro[]

  /** Limiares de virada encontrados por D.4 na varredura do porte. */
  limiares: LimiarVirada[]

  /**
   * Fatos que faltaram. Não-vazio ⇒ `estado` é INDETERMINADO e a tela oferece
   * o gerador de pedido LAI (F.4 / G.1).
   */
  fatos_faltantes: {
    chave: string
    rotulo: string
    /** Órgão a quem o pedido LAI deve ser dirigido. */
    destinatario_sugerido?: string
  }[]

  /** `true` quando algum fundamento da cadeia ainda não foi conferido (C.6). */
  tem_fundamento_pendente: boolean

  /** Preenchido por G.3 quando um pedido LAI é gerado a partir deste parecer. */
  pedido_lai_gerado?: {
    gerado_em: string
    destinatario: string
  }
}

// ---------------------------------------------------------------------------
// Dados geoespaciais (Escopo A) — não é um dos 4 schemas, mas é contrato
// ---------------------------------------------------------------------------

/** Incidência de uma poligonal sobre um município, com proporção de área (A.3). */
export interface IncidenciaMunicipal {
  cd_mun: string
  nm_mun: string
  /** Proporção da área da poligonal dentro deste município, 0–1. */
  proporcao: number
  area_ha: number
}

/** Propriedades de uma feature do GeoJSON de processos (A.4). */
export interface ProcessoProps {
  /** Formato canônico com pontuação. Ex.: "870.123/2019" */
  processo: string
  /** Só dígitos, para busca. Ex.: "8701232019" */
  processo_norm: string
  numero: number
  ano: number
  fase: FaseANM
  substancia: string
  titular: string
  uso: string
  area_ha: number
  ultimo_evento: string
  /** Municípios atingidos, ordenados por proporção decrescente (A.3). */
  municipios: IncidenciaMunicipal[]
  /** `true` quando a poligonal cruza divisa municipal — 4ª virada da demo. */
  cruza_divisa: boolean
}
