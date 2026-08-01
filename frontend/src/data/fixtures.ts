/**
 * ESCOPO 0.3 — fixtures provisórias.
 *
 * ⚠️ DADO NÃO CONFERIDO. Existe para que o motor (D) e a interface (F) rodem
 * ponta a ponta antes de o Escopo C entregar o dado real. Toda `Fundamento`
 * aqui tem `verificado: false`, de propósito: a interface é obrigada a marcar
 * pendência, e é assim que se descobre se a marcação funciona.
 *
 * Substituição: C.1 troca `TIPOLOGIAS`, C.2 troca `MUNICIPIOS`, C.4 troca
 * `REGRAS`. Os tipos não mudam — é esse o ponto do congelamento em 0.2.
 *
 * Os nomes são reais do contexto baiano. Os NÚMEROS não são: as faixas de
 * porte abaixo são plausíveis, não normativas.
 */

import type {
  MunicipioHabilitacao,
  Parecer,
  Regra,
  Tipologia,
} from '@/lib/schemas'

/** Marca única para varrer o repo antes do congelamento e não sobrar nada. */
export const FIXTURE = 'PROVISORIO-0.3' as const

const pendente = (norma: string, dispositivo: string) => ({
  norma,
  dispositivo,
  verificado: false as const,
})

// ---------------------------------------------------------------------------
// 2 tipologias
// ---------------------------------------------------------------------------

export const TIPOLOGIAS: Tipologia[] = [
  {
    id: 'extracao-rocha-ornamental',
    codigo: null,
    atividade: 'Extração de rocha ornamental e de revestimento',
    grupo: 'Divisão B — Mineração',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'micro', min: 0, max: 10_000 },
      { faixa: 'pequeno', min: 10_000, max: 50_000 },
      { faixa: 'medio', min: 50_000, max: 200_000 },
      { faixa: 'grande', min: 200_000, max: 1_000_000 },
      { faixa: 'excepcional', min: 1_000_000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo Único — grupo de mineração (transcrição pendente de C.1)',
    ),
  },
  {
    id: 'lavra-ceu-aberto-metalico',
    codigo: null,
    atividade: 'Lavra a céu aberto de minério metálico, com beneficiamento',
    grupo: 'Divisão B — Mineração',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'micro', min: 0, max: 25_000 },
      { faixa: 'pequeno', min: 25_000, max: 100_000 },
      { faixa: 'medio', min: 100_000, max: 500_000 },
      { faixa: 'grande', min: 500_000, max: 2_000_000 },
      { faixa: 'excepcional', min: 2_000_000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'recurso_hidrico', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo Único — grupo de mineração (transcrição pendente de C.1)',
    ),
  },
]

// ---------------------------------------------------------------------------
// 2 municípios — um habilitado, um sem evidência
// ---------------------------------------------------------------------------

export const MUNICIPIOS: MunicipioHabilitacao[] = [
  {
    cd_mun: '2904605',
    nm_mun: 'Brumado',
    status: 'habilitado',
    nivel: 'a confirmar por C.2',
    tipologias_delegadas: ['extracao-rocha-ornamental'],
    ato: null,
    vigencia_desde: null,
    procedencia: {
      fonte: 'FIXTURE 0.3 — habilitação NÃO consultada no GAC',
      data_consulta: '2026-08-01',
    },
    observacao:
      'Valor provisório para destravar D e F. C.2 substitui com o dossiê real.',
  },
  {
    cd_mun: '2930105',
    nm_mun: 'Senhor do Bonfim',
    status: 'sem_evidencia',
    nivel: null,
    tipologias_delegadas: [],
    ato: null,
    vigencia_desde: null,
    procedencia: {
      fonte: 'Fora da amostra dos 10 — sem levantamento previsto',
      data_consulta: '2026-08-01',
    },
    observacao:
      'Estado válido do produto: leva a INDETERMINADO e aciona o pedido LAI.',
  },
]

// ---------------------------------------------------------------------------
// 3 regras — uma por caminho de precedência
// ---------------------------------------------------------------------------

export const REGRAS: Regra[] = [
  {
    id: 'federal-substancia-nuclear',
    descricao: 'Minério nuclear atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'URÂNIO' },
    ],
    efeito: {
      instancia: 'UNIAO',
      orgao: 'IBAMA',
      alertas: [
        {
          id: 'nuclear-cnen',
          severidade: 'critico',
          titulo: 'Atividade nuclear',
          detalhe:
            'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.',
        },
      ],
    },
    fundamento: pendente('a confirmar por C.4', 'dispositivo pendente'),
    prioridade: 'P0',
  },
  {
    id: 'municipal-habilitado-tipologia-delegada',
    descricao:
      'Município habilitado, com a tipologia entre as delegadas e porte dentro da faixa local',
    condicoes: [
      { fato: 'municipio_status', operador: 'igual', valor: 'habilitado' },
      { fato: 'tipologia_delegada_ao_municipio', operador: 'igual', valor: true },
      { fato: 'faixa_porte', operador: 'em', valor: ['micro', 'pequeno'] },
      { fato: 'cruza_divisa', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'MUNICIPAL', orgao: 'MUNICIPIO' },
    exige_fato: ['municipio_status', 'faixa_porte'],
    fundamento: pendente('a confirmar por C.4', 'dispositivo pendente'),
    prioridade: 'P0',
  },
  {
    // Sem esta regra a 2ª virada da demo não existe: acima da faixa delegada
    // ninguém assumia a competência e o motor caía em INDETERMINADO por
    // ausência de regra, que é diferente de ausência de fato.
    // C.4 substitui pelo dispositivo real da LC 140/2011 e da resolução CEPRAM.
    id: 'estadual-porte-acima-da-faixa-delegada',
    descricao:
      'Porte acima da faixa delegada ao município: a competência permanece com o Estado',
    condicoes: [
      { fato: 'faixa_porte', operador: 'em', valor: ['medio', 'grande', 'excepcional'] },
      { fato: 'status_municipais_divergentes', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'ESTADUAL', orgao: 'INEMA' },
    exige_fato: ['faixa_porte'],
    fundamento: pendente('a confirmar por C.4', 'dispositivo pendente'),
    prioridade: 'P0',
  },
  {
    id: 'condicional-divisa-status-divergente',
    descricao:
      'Poligonal repartida entre municípios com status de habilitação divergente',
    condicoes: [
      { fato: 'cruza_divisa', operador: 'igual', valor: true },
      { fato: 'status_municipais_divergentes', operador: 'igual', valor: true },
    ],
    efeito: {
      instancia: 'INDETERMINADA',
      orgao: 'INDETERMINADO',
      alertas: [
        {
          id: 'divisa-divergente',
          severidade: 'atencao',
          titulo: 'Competência não determinável com os fatos disponíveis',
          detalhe:
            'A poligonal atinge municípios com habilitação divergente ou desconhecida.',
        },
      ],
    },
    torna_condicional: true,
    fundamento: pendente('a confirmar por C.4', 'dispositivo pendente'),
    prioridade: 'P0',
  },
]

// ---------------------------------------------------------------------------
// 1 parecer — formato de saída completo, para F desenhar contra algo
// ---------------------------------------------------------------------------

export const PARECER: Parecer = {
  schema_versao: '1.0.0',
  gerado_em: '2026-08-01T12:00:00-03:00',
  estado: 'INDETERMINADO',
  instancia: 'INDETERMINADA',
  orgao: 'INDETERMINADO',
  fatos: {
    processo: { chave: 'processo', valor: '871.108/2018', origem: 'cadastro' },
    substancia: { chave: 'substancia', valor: 'MINÉRIO DE OURO', origem: 'cadastro' },
    cruza_divisa: { chave: 'cruza_divisa', valor: true, origem: 'derivado' },
    municipio_status: { chave: 'municipio_status', valor: null, origem: 'cadastro' },
  },
  trilha_selecionada: null,
  opcoes: [],
  prazo_legal_total_dias: null,
  n_licencas: null,
  anuencias: [],
  alertas: [
    {
      id: 'divisa-divergente',
      severidade: 'atencao',
      titulo: 'Competência não determinável com os fatos disponíveis',
      detalhe:
        'A poligonal se reparte entre Campo Formoso (36,7%), Jaguarari (35,2%) e Senhor do Bonfim (28,1%). Não há evidência pública de habilitação para Senhor do Bonfim.',
      origem_regra: 'condicional-divisa-status-divergente',
    },
  ],
  fatores_concorrentes: [],
  rastro: [
    {
      ordem: 1,
      regra_id: 'condicional-divisa-status-divergente',
      descricao:
        'Poligonal repartida entre municípios com status de habilitação divergente',
      disparou: true,
      avaliacoes: [
        {
          predicado: { fato: 'cruza_divisa', operador: 'igual', valor: true },
          valor_observado: true,
          resultado: true,
        },
      ],
      fundamento: pendente('a confirmar por C.4', 'dispositivo pendente'),
    },
  ],
  limiares: [],
  fatos_faltantes: [
    {
      chave: 'municipio_status',
      rotulo: 'Habilitação de Senhor do Bonfim para gestão ambiental compartilhada',
      destinatario_sugerido: 'Secretaria do Meio Ambiente do Estado da Bahia',
    },
  ],
  tem_fundamento_pendente: true,
}
