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
// 17 tipologias — extraídas de data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx
// via pipeline/gerar_tipologias.py. Faixas de porte batem com as 3 colunas da
// planilha (pequeno/médio/grande); não há "micro" nem "excepcional" na fonte,
// então essas faixas não existem aqui — não fabricamos limite que a norma não
// publica. B4.2 é a exceção: a fronteira pequeno/médio não consta na
// publicação oficial (célula de origem tem erro de fórmula), então só a faixa
// "grande" tem o mesmo sentido de fronteira confirmada; o resto do intervalo
// [0, 200_000) fica marcado como "medio" por aproximação, pendente de C.1.
// ---------------------------------------------------------------------------

export const TIPOLOGIAS: Tipologia[] = [
  {
    id: 'b1-1-1',
    codigo: 'B1.1.1',
    atividade: 'Ferro',
    grupo: 'Divisão B — Mineração · Grupo B1: Minerais Metálicos e Não Metálicos',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 300000 },
      { faixa: 'medio', min: 300000, max: 1500000 },
      { faixa: 'grande', min: 1500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B1.1.1',
    ),
  },
  {
    id: 'b1-1-2',
    codigo: 'B1.1.2',
    atividade: 'Manganês',
    grupo: 'Divisão B — Mineração · Grupo B1: Minerais Metálicos e Não Metálicos',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B1.1.2',
    ),
  },
  {
    id: 'b1-1-3',
    codigo: 'B1.1.3',
    atividade: 'Alumínio, Antimônio, Cádmio, Chumbo, Cobre, Cromo, Escândio, Estanho, Estrôncio, Frâncio, Gálio, Germânio, Háfnio, Índio, Irídio, Ítrio, Lítio, Molibdênio, Nióbio, Níquel, Ósmio, Ouro, Paládio, Platina, Prata, Ródio, Rubídio, Selênio, Tálio, Tântalo, Tecnécio, Titânio, Tungstênio, Vanádio, Zinco e Zircônio',
    grupo: 'Divisão B — Mineração · Grupo B1: Minerais Metálicos e Não Metálicos',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 50000 },
      { faixa: 'medio', min: 50000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B1.1.3',
    ),
  },
  {
    id: 'b1-2-1',
    codigo: 'B1.2.1',
    atividade: 'Criolita, Enxofre, Fluorita, Selênio, Silício, Silicatos e Telúrio',
    grupo: 'Divisão B — Mineração · Grupo B1: Minerais Metálicos e Não Metálicos',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 800000 },
      { faixa: 'grande', min: 800000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B1.2.1',
    ),
  },
  {
    id: 'b2-1',
    codigo: 'B2.1',
    atividade: 'Ágata, Água Marinha, Alexandrita, Berilo, Calcedônia, Cianita, Citrino, Crisoberilo, Granada, Heliotrópio, Jacinto, Jade, Jaspe, Lápis-Lazúli, Lazurita, Olho de Tigre, Opala, Rubi, Safira, Topázio, Turmalina, Turquesa e outras',
    grupo: 'Divisão B — Mineração · Grupo B2: Gemas ou Pedras Preciosas e Semi-Preciosas',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 5000 },
      { faixa: 'medio', min: 5000, max: 50000 },
      { faixa: 'grande', min: 50000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B2.1',
    ),
  },
  {
    id: 'b2-2',
    codigo: 'B2.2',
    atividade: 'Ametista, Diamante, Esmeralda',
    grupo: 'Divisão B — Mineração · Grupo B2: Gemas ou Pedras Preciosas e Semi-Preciosas',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 10000 },
      { faixa: 'medio', min: 10000, max: 50000 },
      { faixa: 'grande', min: 50000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B2.2',
    ),
  },
  {
    id: 'b3-1',
    codigo: 'B3.1',
    atividade: 'Areias, Arenoso, Cascalhos, Filitos e Saibro',
    grupo: 'Divisão B — Mineração · Grupo B3: Minerais Utilizados na Construção Civil, Ornamentos e Outros',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 150000 },
      { faixa: 'medio', min: 150000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B3.1',
    ),
  },
  {
    id: 'b3-2',
    codigo: 'B3.2',
    atividade: 'Areias em Recursos Hídricos',
    grupo: 'Divisão B — Mineração · Grupo B3: Minerais Utilizados na Construção Civil, Ornamentos e Outros',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 75000 },
      { faixa: 'medio', min: 75000, max: 150000 },
      { faixa: 'grande', min: 150000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'recurso_hidrico', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B3.2',
    ),
  },
  {
    id: 'b3-3',
    codigo: 'B3.3',
    atividade: 'Caulim',
    grupo: 'Divisão B — Mineração · Grupo B3: Minerais Utilizados na Construção Civil, Ornamentos e Outros',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B3.3',
    ),
  },
  {
    id: 'b3-4',
    codigo: 'B3.4',
    atividade: 'Basalto, Calcários, Gnaisses, Granitos, Granulitos, Metarenitos, Quartzitos, Sienitos, Dentre Outras Utilizadas Para a Produção de Agregados e Beneficiamento Associado (Britamento)',
    grupo: 'Divisão B — Mineração · Grupo B3: Minerais Utilizados na Construção Civil, Ornamentos e Outros',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B3.4',
    ),
  },
  {
    id: 'b3-5',
    codigo: 'B3.5',
    atividade: 'Ardósia, Dioritos, Granitos, Mármores, Quartzos, Sienitos, Dentre Outras Utilizadas Para Revestimento',
    grupo: 'Divisão B — Mineração · Grupo B3: Minerais Utilizados na Construção Civil, Ornamentos e Outros',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 50000 },
      { faixa: 'medio', min: 50000, max: 150000 },
      { faixa: 'grande', min: 150000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B3.5',
    ),
  },
  {
    id: 'b4-1',
    codigo: 'B4.1',
    atividade: 'Argilas, Caulinita, Diatomita, Ilita, Caulim Dentre Outros',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 60000 },
      { faixa: 'medio', min: 60000, max: 150000 },
      { faixa: 'grande', min: 150000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.1',
    ),
  },
  {
    id: 'b4-2',
    codigo: 'B4.2',
    atividade: 'Cianita, Feldspato, Leucita, Moscovita, Nefelina, Quartzo e Turmalina, Dentre Outros, Para Manufatura de Vidro/Vitrificação, Esmaltação e Indústria óptica, Eletrônica, etc.',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'medio', min: 0, max: 200000 },
      { faixa: 'grande', min: 200000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.2 (faixa de porte pequeno/médio não expressa na fonte — pendente de confirmação em C.1)',
    ),
  },
  {
    id: 'b4-3',
    codigo: 'B4.3',
    atividade: 'Apatita, Calcário Dolomítico, Calcita, Carnalita, Dolomita, Fosfatos, Minerais de Borato, Potássio, Salgema, Salitre, Silvita e Sódio, Dentre Outros, Para Produção de Fertilizantes e Corretivos Agrícolas, etc.',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.3',
    ),
  },
  {
    id: 'b4-4',
    codigo: 'B4.4',
    atividade: 'Andalusita, Anfibólios, Caulinita, Coríndon, Feldspato, Grafita, Moscovita, Pegmatito, Quartzito, Serpentinito, Sílex, Vermiculita, Wollastonita, Xisto e Zirconita, Dentre Outros, Para Uso Industrial Não Especificado Anteriormente',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.4',
    ),
  },
  {
    id: 'b4-5',
    codigo: 'B4.5',
    atividade: 'Anidrita, Barita, Bentonita, Calcário Conchífero, Calcário Calcítico, Calcita, Diatomita, Gipsita, Magnesita e Talco',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.5',
    ),
  },
  {
    id: 'b4-6',
    codigo: 'B4.6',
    atividade: 'Amianto',
    grupo: 'Divisão B — Mineração · Grupo B4: Minerais Utilizados na Indústria',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 20000 },
      { faixa: 'medio', min: 20000, max: 300000 },
      { faixa: 'grande', min: 300000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: pendente(
      'Resolução CEPRAM 4.420/2015',
      'Anexo IV — Divisão B, B4.6',
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
    tipologias_delegadas: ['b3-5'],
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
