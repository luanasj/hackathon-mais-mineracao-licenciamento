/**
 * ESCOPO C — dado real, gerado por scripts/build_fixtures.py.
 *
 * NÃO EDITAR À MÃO. Para atualizar, rode:
 *   .venv/Scripts/python.exe scripts/build_fixtures.py
 *
 * Substituição: C.1 troca `TIPOLOGIAS`, C.4 troca `REGRAS`. C.2 já trocou
 * `MUNICIPIOS` — ver `@/data/municipios_gac.ts`. Os tipos não mudam — é esse
 * o ponto do congelamento em 0.2.
 *
 * Os nomes são reais do contexto baiano. Os NÚMEROS não são: as faixas de
 * porte abaixo são plausíveis, não normativas.
 * Fontes:
 *   TIPOLOGIAS B3/B4 — data/processed/cepram_divisao_b_mineracao.json,
 *     extração verificada do PDF oficial (Resolução CEPRAM 4.327/2013,
 *     Anexo Único, Divisão B). `fundamento.verificado: true`.
 *   TIPOLOGIAS B1/B2 (+ B4.5/B4.6) — data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx.
 *     Única fonte disponível para esses itens (ausentes do PDF oficial), mas
 *     essa MESMA planilha já divergiu do PDF oficial nos itens onde dava pra
 *     comparar (B3/B4) — por isso `fundamento.verificado: false` aqui, sempre,
 *     com nota explícita da divergência conhecida. Não inventamos confiança
 *     que a fonte não sustenta.
 *   MUNICIPIOS — data/processed/municipios_habilitados.json (GAC/SEMA-BA,
 *     417 municípios). `tipologias_delegadas` é cruzamento do nível GAC do
 *     município com `nivel_gestao_municipal` de cada tipologia B3/B4 (única
 *     tipologia com esse dado no PDF — B1/B2 nunca aparecem delegadas).
 *   REGRAS — fundamentadas em LC 140/2011 (arts. 7º, 8º, 9º) e Resolução
 *     CEPRAM 4.327/2013 (arts. 2º §2º e 7º). Citação real, mas
 *     `fundamento.verificado: false`: confirmação humana contra a fonte
 *     primária (C.6) ainda não ocorreu.
 */

import type { Parecer, Regra, Tipologia } from '@/lib/schemas'

/** Marca única para varrer o repo antes do congelamento e não sobrar nada. */
export const FIXTURE = 'C-INTEGRADO-0.1' as const

const pendente = (norma: string, dispositivo: string) => ({
  norma,
  dispositivo,
  verificado: false as const,
})

// ---------------------------------------------------------------------------
// TIPOLOGIAS
// ---------------------------------------------------------------------------

export const TIPOLOGIAS: Tipologia[] = [
  {
    id: 'b1-1-1',
    codigo: 'B1.1.1',
    atividade: 'Ferro',
    grupo: 'Grupo B1: Minerais Metálicos e Não Metálicos',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B1.1.1 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b1-1-2',
    codigo: 'B1.1.2',
    atividade: 'Manganês',
    grupo: 'Grupo B1: Minerais Metálicos e Não Metálicos',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B1.1.2 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b1-1-3',
    codigo: 'B1.1.3',
    atividade: 'Alumínio, Antimônio, Cádmio, Chumbo, Cobre, Cromo, Escândio, Estanho, Estrôncio, Frâncio, Gálio, Germânio, Háfnio, Índio, Irídio, Ítrio, Lítio, Molibdênio, Nióbio, Níquel, Ósmio, Ouro, Paládio, Platina, Prata, Ródio, Rubídio, Selênio, Tálio, Tântalo, Tecnécio, Titânio, Tungstênio, Vanádio, Zinco e Zircônio',
    grupo: 'Grupo B1: Minerais Metálicos e Não Metálicos',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B1.1.3 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b1-2-1',
    codigo: 'B1.2.1',
    atividade: 'Criolita, Enxofre, Fluorita, Selênio, Silício, Silicatos e Telúrio',
    grupo: 'Grupo B1: Minerais Metálicos e Não Metálicos',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B1.2.1 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b2-1',
    codigo: 'B2.1',
    atividade: 'Ágata, Água Marinha, Alexandrita, Berilo, Calcedônia, Cianita, Citrino, Crisoberilo, Granada, Heliotrópio, Jacinto, Jade, Jaspe, Lápis-Lazúli, Lazurita, Olho de Tigre, Opala, Rubi, Safira, Topázio, Turmalina, Turquesa e outras',
    grupo: 'Grupo B2: Gemas ou Pedras Preciosas e Semi-Preciosas',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B2.1 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b2-2',
    codigo: 'B2.2',
    atividade: 'Ametista, Diamante, Esmeralda',
    grupo: 'Grupo B2: Gemas ou Pedras Preciosas e Semi-Preciosas',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B2.2 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b3-1',
    codigo: 'B3.1',
    atividade: 'Areias, Arenoso, Cascalhos, Filitos',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Construção Civil, Ornamentos e Outros (B3)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 75000 },
      { faixa: 'medio', min: 75000, max: 375000 },
      { faixa: 'grande', min: 375000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B3.1 (pág. 12 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b3-2',
    codigo: 'B3.2',
    atividade: 'Areias em Recursos Hídricos',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Construção Civil, Ornamentos e Outros (B3)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 20000 },
      { faixa: 'medio', min: 20000, max: 100000 },
      { faixa: 'grande', min: 100000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'recurso_hidrico', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B3.2 (pág. 12 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b3-3',
    codigo: 'B3.3',
    atividade: 'Gesso, Caulim e Saibro',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Construção Civil, Ornamentos e Outros (B3)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 50000 },
      { faixa: 'medio', min: 50000, max: 250000 },
      { faixa: 'grande', min: 250000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B3.3 (pág. 12 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b3-4',
    codigo: 'B3.4',
    atividade: 'Basalto, Calcários, Gnaisses, Granitos, Granulitos, Metarenitos, Quartzitos, Sienitos, Dentre Outras Utilizadas Para a Produção de Agregados e Beneficiamento Associado (Britamento)',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Construção Civil, Ornamentos e Outros (B3)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 50000 },
      { faixa: 'medio', min: 50000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B3.4 (pág. 13 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b3-5',
    codigo: 'B3.5',
    atividade: 'Ardósia, Dioritos, Granitos, Mármores, Quartzitos, Sienitos, Dentre Outras Utilizadas Para Revestimento',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Construção Civil, Ornamentos e Outros (B3)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 20000 },
      { faixa: 'medio', min: 20000, max: 60000 },
      { faixa: 'grande', min: 60000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B3.5 (pág. 13 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b4-1',
    codigo: 'B4.1',
    atividade: 'Materiais Cerâmicos (Argilas, Caulinita, Diatomita, Ilita e Montmorilonita, Dentre Outros)',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Indústria (B4)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 30000 },
      { faixa: 'medio', min: 30000, max: 100000 },
      { faixa: 'grande', min: 100000, max: null },
    ],
    potencial_poluente: 'medio',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B4.1 (pág. 13 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b4-2',
    codigo: 'B4.2',
    atividade: 'Cianita, Feldspato, Fluorita, Leucita, Moscovita, Nefelina, Quartzo e Turmalina, Dentre Outros, Para Manufatura de Vidro/Vitrificação, Esmaltação e Indústria Óptica, Eletrônica, etc',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Indústria (B4)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 20000 },
      { faixa: 'medio', min: 20000, max: 200000 },
      { faixa: 'grande', min: 200000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B4.2 (pág. 14 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b4-3',
    codigo: 'B4.3',
    atividade: 'Apatita, Bentonita, Calcário, Calcita, Carnalita, Dolomita, Fosfatos, Guano, Minerais de Borato, Potássio, Salgema, Salitre, Silvita e Sódio, Dentre Outros, Para Produção de Fertilizantes e Corretivos Agrícolas, etc',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Indústria (B4)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 100000 },
      { faixa: 'medio', min: 100000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B4.3 (pág. 14 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b4-4',
    codigo: 'B4.4',
    atividade: 'Anidrita, Andalusita, Anfibólios, Barita, Calcário Conchífero, Calcita, Caulinita, Cianita, Coríndon, Feldspato, Gipsita, Grafita, Magnesita, Moscovita, Pegmatito, Quartzo Leitoso, Serpentinito, Sílex, Talco, Vermiculita, Wollastonita, Xisto e Zirconita, Dentre Outros, Para Uso Industrial Não Especificado Anteriormente',
    grupo: 'Divisão B — Mineração · Minerais Utilizados na Indústria (B4)',
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: [
      { faixa: 'pequeno', min: 0, max: 50000 },
      { faixa: 'medio', min: 50000, max: 500000 },
      { faixa: 'grande', min: 500000, max: null },
    ],
    potencial_poluente: 'grande',
    campos_condicionais: ['supressao_vegetacao', 'explosivos'],
    fundamento: {
      norma: 'Resolução CEPRAM 4.327/2013',
      dispositivo: 'Anexo Único — Divisão B: Mineração, B4.4 (pág. 14-15 do PDF oficial)',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  },
  {
    id: 'b4-5',
    codigo: 'B4.5',
    atividade: 'Anidrita, Barita, Bentonita, Calcário Conchífero, Calcário Calcítico, Calcita, Diatomita, Gipsita, Magnesita e Talco',
    grupo: 'Grupo B4: Minerais Utilizados na Indústria',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B4.5 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
  {
    id: 'b4-6',
    codigo: 'B4.6',
    atividade: 'Amianto',
    grupo: 'Grupo B4: Minerais Utilizados na Indústria',
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
      'fonte divergente — ver nota no cabeçalho do arquivo',
      'Anexo IV — Divisão B, B4.6 (planilha auxiliar, NÃO conferida contra o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota no topo deste arquivo)',
    ),
  },
]

// ---------------------------------------------------------------------------
// MUNICIPIOS — C.2 entregou. Ver `@/data/municipios_gac.ts` (417 municípios,
// gerado por `pipeline/gerar_municipios.py` a partir do Sistema GAC real).
// `tipologias_delegadas` ainda sai `[]` de lá — ver a nota no gerador.
// ---------------------------------------------------------------------------

export { MUNICIPIOS } from '@/data/municipios_gac'

// ---------------------------------------------------------------------------
// REGRAS (C.4) — fundamentadas em LC 140/2011 e CEPRAM 4.327/2013.
// Citação real; verificado:false até confirmação humana contra a fonte (C.6).
// ---------------------------------------------------------------------------

export const REGRAS: Regra[] = [
  // Três regras, não uma com OR: o motor não tem operador OR de propósito
  // (ver lib/motor.ts) — disjunção vira regras separadas, pra cada substância
  // radioativa aparecer como caminho isolado no rastro de execução. Mesmo
  // efeito e mesmo fundamento nas três: LC 140/2011 Art. 7º, XIV, "g" fala em
  // "material radioativo, em qualquer estágio" — não só urânio.
  {
    id: 'federal-substancia-nuclear',
    descricao: 'Minério de urânio atrai a competência federal, qualquer que seja o porte',
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
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'federal-substancia-radioativa-torio',
    descricao: 'Minério de tório atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'TÓRIO' },
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
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'federal-substancia-radioativa-monazita',
    descricao:
      'Monazita (areia monazítica, radioativa por conter tório/urânio associados) atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'MONAZITA' },
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
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'municipal-habilitado-tipologia-delegada',
    descricao:
      'Município habilitado, com a tipologia entre as delegadas e porte dentro da faixa local',
    condicoes: [
      { fato: 'municipio_status', operador: 'igual', valor: 'habilitado' },
      { fato: 'tipologia_delegada_ao_municipio', operador: 'igual', valor: true },
      { fato: 'faixa_porte', operador: 'em', valor: ['pequeno'] },
      { fato: 'cruza_divisa', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'MUNICIPAL', orgao: 'MUNICIPIO' },
    exige_fato: ['municipio_status', 'faixa_porte'],
    fundamento: pendente(
      'LC 140/2011 c/c Resolução CEPRAM 4.327/2013',
      'LC 140/2011 Art. 9º, XIV, "a" (competência municipal para impacto local, "conforme tipologia definida pelos respectivos Conselhos Estaduais de Meio Ambiente") c/c CEPRAM 4.327/2013 Art. 2º §2º e Art. 7º (delegação de níveis de gestão ambiental compartilhada ao município, condicionada à comunicação à SEMA)',
    ),
    prioridade: 'P0',
  },
  {
    // Sem esta regra a 2ª virada da demo não existe: acima da faixa delegada
    // ninguém assumia a competência e o motor caía em INDETERMINADO por
    // ausência de regra, que é diferente de ausência de fato.
    id: 'estadual-porte-acima-da-faixa-delegada',
    descricao:
      'Porte acima da faixa delegada ao município: a competência permanece com o Estado',
    condicoes: [
      { fato: 'faixa_porte', operador: 'em', valor: ['medio', 'grande'] },
      { fato: 'status_municipais_divergentes', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'ESTADUAL', orgao: 'INEMA' },
    exige_fato: ['faixa_porte'],
    fundamento: pendente(
      'LC 140/2011',
      'Art. 8º, XIV — compete aos Estados licenciar "atividades ou empreendimentos utilizadores de recursos ambientais, efetiva ou potencialmente poluidores ou capazes, sob qualquer forma, de causar degradação ambiental, ressalvado o disposto nos arts. 7º e 9º" — competência remanescente do Estado quando não há atribuição federal (Art. 7º) nem delegação municipal efetiva (Art. 9º)',
    ),
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
    fundamento: {
      norma: 'Critério interno do motor (D.5)',
      dispositivo:
        'Não é competência normativa externa — é a regra de honestidade do produto: ausência de habilitação uniforme sob a mesma poligonal nunca vira chute de competência, sempre INDETERMINADO + pedido LAI.',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
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
      fundamento: {
        norma: 'Critério interno do motor (D.5)',
        dispositivo:
          'Ausência de habilitação uniforme sob a mesma poligonal nunca vira chute de competência.',
        verificado: true,
        data_conferencia: '2026-08-01',
      },
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
