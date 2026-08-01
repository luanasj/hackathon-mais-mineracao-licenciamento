/**
 * ESCOPO A.8 — as quatro viradas da demo, embarcadas no bundle.
 *
 * Critério de aceite: os 4 carregam mesmo que o índice inteiro falhe. Por isso
 * estão aqui como literal TypeScript, e não em `public/data/`. Se o fetch do
 * GeoJSON cair no palco, a demo continua de pé.
 *
 * Todos os atributos abaixo foram extraídos do shapefile SIGMINE versionado em
 * `data_source/BA-shapefile/` — nenhum foi inventado. Conferir com:
 *
 *     python pipeline/prep.py
 *     jq '.[] | select(.processo_norm=="8718552021")' app/public/data/indice_processos.json
 */

import type { ProcessoProps } from '@/lib/schemas'

export interface Virada {
  /** 1 a 4, na ordem em que aparecem no pitch. */
  n: 1 | 2 | 3 | 4
  titulo: string
  /** O único campo que muda em relação à virada anterior. */
  mudanca: string
  /** Resposta esperada do motor. Vira asserção na suíte D.8. */
  esperado: string
  /** O que a virada prova para a banca. */
  prova: string
  processo: ProcessoProps
  /**
   * Caracterização mínima que a virada precisa para o motor chegar ao
   * `esperado`. Não é dado do SIGMINE — é o preenchimento do formulário que o
   * demonstrador faria à mão, aqui declarado para que o botão prove o que diz.
   * O `tipologia_id` referencia `data/fixtures.ts`; o porte está na unidade da
   * tipologia.
   */
  preset: { tipologia_id: string; porte_valor: number }
  /** Centro da poligonal, para o mapa enquadrar sem calcular. */
  centro: [number, number]
  /**
   * Dependências ainda abertas para esta virada existir de fato.
   * Vazio = a virada está fechada com dado real.
   */
  pendencias: string[]
}

/**
 * Viradas 1 e 2 usam o MESMO processo — é esse o ponto: um campo muda, a
 * resposta vira. `871.855/2021` está em regime de LICENCIAMENTO
 * (Lei 6.567/1978), que é o gatilho de competência local de B.3, com 49,97 ha
 * inteiramente dentro de Brumado.
 */
const GRANITO_BRUMADO: ProcessoProps = {
  processo: '871.855/2021',
  processo_norm: '8718552021',
  numero: 871855,
  ano: 2021,
  fase: 'LICENCIAMENTO',
  substancia: 'GRANITO',
  titular: 'MINERACAO PEDRA CUBICA LTDA',
  uso: 'Revestimento',
  area_ha: 49.97,
  ultimo_evento: '760 - LICEN/RAL ANO BASE APRESENTADO EM 13/03/2026',
  municipios: [
    { cd_mun: '2904605', nm_mun: 'Brumado', proporcao: 1.0, area_ha: 49.97 },
  ],
  cruza_divisa: false,
}

const URANIO_CAETITE: ProcessoProps = {
  processo: '871.787/2024',
  processo_norm: '8717872024',
  numero: 871787,
  ano: 2024,
  fase: 'CONCESSÃO DE LAVRA',
  substancia: 'MINÉRIO DE URÂNIO',
  titular: 'INDUSTRIAS NUCLEARES DO BRASIL S.A - INB',
  uso: 'Industrial',
  area_ha: 1908.72,
  ultimo_evento: '473 - CONC LAV/CUMPRIMENTO EXIGÊNCIA PROTOC EM 29/07/2026',
  municipios: [
    { cd_mun: '2905206', nm_mun: 'Caetité', proporcao: 1.0, area_ha: 1908.72 },
  ],
  cruza_divisa: false,
}

/**
 * A poligonal se reparte quase em terços entre três municípios, e o terceiro
 * — Senhor do Bonfim — está FORA da amostra dos 10, portanto entra no motor
 * como `sem_evidencia`. É o caso mais forte para INDETERMINADO: não é só
 * divisa, é divisa com status de habilitação desconhecido do outro lado.
 */
const OURO_TRIPLICE: ProcessoProps = {
  processo: '871.108/2018',
  processo_norm: '8711082018',
  numero: 871108,
  ano: 2018,
  fase: 'AUTORIZAÇÃO DE PESQUISA',
  substancia: 'MINÉRIO DE OURO',
  titular: 'J. V. S. MARMORES E GRANITOS LTDA.',
  uso: 'Industrial',
  area_ha: 1336.61,
  ultimo_evento:
    '794 - AUT PESQ/RELATÓRIO FINAL PESQUISA POSITIVO PROTOC EM 15/06/2026',
  municipios: [
    { cd_mun: '2906006', nm_mun: 'Campo Formoso', proporcao: 0.3674, area_ha: 491.13 },
    { cd_mun: '2917706', nm_mun: 'Jaguarari', proporcao: 0.3519, area_ha: 470.42 },
    { cd_mun: '2930105', nm_mun: 'Senhor do Bonfim', proporcao: 0.2806, area_ha: 375.06 },
  ],
  cruza_divisa: true,
}

export const VIRADAS: readonly Virada[] = [
  {
    n: 1,
    titulo: 'Município habilitado, tipologia delegada',
    mudanca: '— (estado inicial)',
    esperado: 'MUNICIPAL — definida',
    prova: 'Caminho feliz, com fundamento citado',
    processo: GRANITO_BRUMADO,
    // 8.000 t/ano cai em `micro` (0–10.000), dentro da faixa delegada.
    preset: { tipologia_id: 'extracao-rocha-ornamental', porte_valor: 8_000 },
    centro: [-41.48388, -13.96943],
    pendencias: [
      'C.2 — confirmar que Brumado está habilitado e que a tipologia de extração de granito está entre as delegadas',
      'C.1 — transcrever a tipologia de rocha ornamental da CEPRAM 4.420/2015 com suas faixas de porte',
    ],
  },
  {
    n: 2,
    titulo: 'O porte cruza o limiar da faixa',
    mudanca: 'arrasta o porte para além da fronteira de faixa da tipologia',
    esperado: 'ESTADUAL — INEMA',
    prova: 'Existe função de porte real, e o limiar é exibido',
    processo: GRANITO_BRUMADO,
    // Único campo que muda em relação à virada 1: 120.000 t/ano cai em
    // `medio`, acima da faixa delegada, e a competência sobe para o Estado.
    preset: { tipologia_id: 'extracao-rocha-ornamental', porte_valor: 120_000 },
    centro: [-41.48388, -13.96943],
    pendencias: [
      'C.1 — as fronteiras de faixa vêm da CEPRAM; sem elas D.4 não tem onde varrer',
    ],
  },
  {
    n: 3,
    titulo: 'Substância nuclear',
    mudanca: 'troca a substância para urânio',
    esperado: 'UNIÃO — IBAMA',
    prova: 'Precedência federal absorve tudo abaixo',
    processo: URANIO_CAETITE,
    // Porte irrelevante aqui: a precedência federal absorve tudo abaixo.
    preset: { tipologia_id: 'lavra-ceu-aberto-metalico', porte_valor: 8_000 },
    centro: [-42.277, -13.869],
    pendencias: [],
  },
  {
    n: 4,
    titulo: 'Poligonal cruzando divisa municipal',
    mudanca: 'seleciona a poligonal que se reparte entre três municípios',
    esperado: 'INDETERMINADO → gera pedido LAI',
    prova: 'O sistema não chuta, e a limitação vira ação',
    processo: OURO_TRIPLICE,
    // A poligonal repartida decide sozinha; o porte não muda o resultado.
    preset: { tipologia_id: 'lavra-ceu-aberto-metalico', porte_valor: 8_000 },
    centro: [-40.23189, -10.34654],
    pendencias: [],
  },
] as const

/** Atalho para a suíte D.8 e para os botões de demo. */
export const VIRADA_POR_N = Object.fromEntries(
  VIRADAS.map((v) => [v.n, v]),
) as Record<1 | 2 | 3 | 4, Virada>

/**
 * Alternativas verificadas, caso o dossiê C.2 desqualifique alguma escolha
 * acima. Todas existem no SIGMINE e estão dentro da amostra.
 */
export const ALTERNATIVAS = {
  /** Outros processos em regime de LICENCIAMENTO, um município só, 50 ha. */
  virada1: ['871.032/2016 — GRANITO, Brumado', '871.109/2020 — AREIA, Jacobina'],
  /** Segundo processo de urânio da INB em Caetité. */
  virada3: ['871.786/2024 — MINÉRIO DE URÂNIO, Caetité, 1.992,74 ha'],
  /** Outras poligonais repartidas entre municípios da amostra. */
  virada4: [
    '870.204/2003 — OURO, Jaguarari 53,8% + Campo Formoso 42,9%',
    '870.667/2013 — FERRO, Andorinha 78,6% + Jaguarari 11,7%',
  ],
} as const
