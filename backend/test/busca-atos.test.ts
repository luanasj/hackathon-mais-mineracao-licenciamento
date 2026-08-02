/**
 * Busca de atos por relevância (FTS5).
 *
 * Os excertos de `CORPUS` são **recortes reais** de `data/db/licenciamento.db`,
 * copiados à mão e reduzidos: um RLO de mineração, uma portaria de licença
 * ambiental, uma peça orçamentária citando CFEM e um cabeçalho de decreto
 * sanitário. Fixture sintética não serviria aqui — o que se está testando é
 * precisamente a separação entre licença de verdade e ruído de diário oficial,
 * e ruído inventado é sempre mais fácil de separar do que o real.
 *
 * O banco é criado em memória a cada teste: a suíte não depende de
 * `data/db/licenciamento.db` existir nem de `build_local_db.sh` ter rodado.
 */
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { describe, it } from 'node:test'

import {
  VOCABULARIO_LICENCIAMENTO,
  criarBuscadorAtos,
  montarDisjuncao,
  termosDeSubstancia,
} from '../src/busca-atos.ts'

// ---------------------------------------------------------------------------
// Corpus real reduzido
// ---------------------------------------------------------------------------

const CORPUS: [codigo: string, data: string, termo: string, excerto: string][] = [
  [
    '2910800',
    '2024-08-15',
    'licenciamento ambiental',
    'PÚBLICO que após a devida instrução do Processo Administrativo nº 2023.024/PRO.SOMAS-RLO, ' +
      'CONCEDEU A RENOVAÇÃO DA LICENÇA AMBIENTAL DE OPERAÇÃO - RLO, para o desempenho da ' +
      'atividade de extração de areia e cascalho em leito de rio.',
  ],
  [
    '2910800',
    '2024-06-06',
    'licenciamento ambiental',
    'AMBIENTE E LIMPEZA PÚBLICA PORTARIA SEMMA Nº019 DE 06 DE JUNHO DE 2024 "Conceder LICENÇA ' +
      'AMBIENTAL DE ALTERAÇÃO Nº 001/2024 à pessoa física Getúlio dos Santos Cruz, referente à ' +
      'atividade de comércio varejista."',
  ],
  [
    '2910800',
    '2023-12-12',
    'cfem',
    'Principal 4.300,00 1.7.1.2.00.0.0.00 Transferência da Compensação Financeira pela ' +
      'Exploração de Recursos Naturais 737.500,00 1.7.1.2.51.0.0.00 Cota-parte da Compensação ' +
      'Financeira de Recursos Minerais - CFEM 85.500,00',
  ],
  [
    '2910800',
    '2012-07-17',
    'licenciamento ambiental',
    'Prefeitura Municipal de Abaré publica: Decreto n.º123 de 17 de julho de 2012 - Institui a ' +
      'Comissão de Vigilância em Saúde Ambiental e dispõe sobre o controle de vetores e zoonoses.',
  ],
  [
    '2999999',
    '2020-01-01',
    'mineracao',
    'Ata da sessão ordinária. Aprovado o projeto de pavimentação com uso de areia e brita ' +
      'adquiridas por licitação.',
  ],
]

function bancoDeTeste(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE ato_diario_oficial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_ibge TEXT NOT NULL,
      termo TEXT NOT NULL,
      url TEXT NOT NULL,
      data_ato TEXT,
      excerto TEXT NOT NULL,
      confirmado_manualmente INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE ato_fts USING fts5(
      excerto, content='ato_diario_oficial', content_rowid='id',
      tokenize="unicode61 remove_diacritics 2"
    );
  `)
  const ins = db.prepare(
    'INSERT INTO ato_diario_oficial (codigo_ibge, termo, url, data_ato, excerto) VALUES (?,?,?,?,?)',
  )
  CORPUS.forEach(([cod, data, termo, excerto], i) =>
    ins.run(cod, termo, `https://exemplo/${i}`, data, excerto),
  )
  db.exec("INSERT INTO ato_fts(ato_fts) VALUES('rebuild')")
  return db
}

const B3_1 = 'Areias, Arenoso, Cascalhos, Filitos'

// ---------------------------------------------------------------------------

describe('termosDeSubstancia — derivação mecânica', () => {
  it('extrai as substâncias do nome da tipologia, singularizadas e sem acento', () => {
    assert.deepEqual(termosDeSubstancia(B3_1), ['areia', 'arenoso', 'cascalho', 'filito'])
  })

  it('descarta conectivo e uso industrial, mantendo só mineral', () => {
    const t = termosDeSubstancia(
      'Basalto, Calcários, Gnaisses, Granitos, Dentre Outras Utilizadas Para a Produção de ' +
        'Agregados e Beneficiamento Associado (Britamento)',
    )
    assert.deepEqual(t, ['basalto', 'calcario', 'gnaisse', 'granito'])
  })

  it('descarta adjetivo de qualidade, preservando a substância', () => {
    // "Quartzo Leitoso" -> quartzo ; "Calcário Conchífero" -> calcario
    const t = termosDeSubstancia('Calcário Conchífero, Quartzo Leitoso')
    assert.deepEqual(t, ['calcario', 'quartzo'])
  })

  it('acrescenta a substância do SIGMINE, sem o prefixo "MINÉRIO DE"', () => {
    const t = termosDeSubstancia(B3_1, 'MINÉRIO DE FERRO')
    assert.ok(t.includes('ferro'))
    assert.ok(!t.includes('minerio'))
  })

  it('devolve [] quando não há nome nem substância', () => {
    assert.deepEqual(termosDeSubstancia(null, null), [])
  })
})

describe('montarDisjuncao — proteção da expressão FTS5', () => {
  it('mantém frases entre aspas e siglas', () => {
    assert.equal(montarDisjuncao(['"licenca de operacao"', 'LAO']), '"licenca de operacao" OR LAO')
  })

  it('descarta termo com caractere que quebraria a consulta', () => {
    assert.equal(montarDisjuncao(['areia', 'a"b', 'x OR y', 'cascalho']), 'areia OR cascalho')
  })

  it('o vocabulário de licenciamento inteiro sobrevive à proteção', () => {
    const saida = montarDisjuncao(VOCABULARIO_LICENCIAMENTO)
    assert.equal(saida.split(' OR ').length, VOCABULARIO_LICENCIAMENTO.length)
  })
})

describe('criarBuscadorAtos — precisão contra o corpus real', () => {
  const buscar = criarBuscadorAtos(bancoDeTeste())

  it('acha o RLO de extração de areia com relevância alta', () => {
    const r = buscar('2910800', { nomeTipologia: B3_1 })
    assert.ok(r.length > 0)
    assert.equal(r[0].relevancia, 'alta')
    assert.match(r[0].transcricao!, /OPERA/i)
  })

  it('NÃO devolve a peça orçamentária de CFEM', () => {
    const r = buscar('2910800', { nomeTipologia: B3_1 })
    assert.ok(!r.some((a) => /Cota-parte|85\.500/.test(a.transcricao ?? '')))
  })

  it('NÃO devolve o decreto de vigilância sanitária (tem "ambiental", não tem licença)', () => {
    const r = buscar('2910800', { nomeTipologia: B3_1, limite: 10 })
    assert.ok(!r.some((a) => /zoonoses|vetores/.test(a.transcricao ?? '')))
  })

  it('ata de licitação que cita areia sem licença não conta como evidência', () => {
    assert.deepEqual(buscar('2999999', { nomeTipologia: B3_1 }), [])
  })

  it('cai para relevância media quando há licença mas não a substância', () => {
    // Gesso/Caulim/Saibro não aparecem em nenhum excerto; o eixo A ainda casa.
    const r = buscar('2910800', { nomeTipologia: 'Gesso, Caulim e Saibro' })
    assert.ok(r.length > 0)
    assert.ok(r.every((a) => a.relevancia === 'media'))
    assert.deepEqual(r[0].termos_consultados, [])
  })

  it('casa apesar do acento e da caixa do original', () => {
    // O corpus tem "LICENÇA AMBIENTAL DE OPERAÇÃO" em caixa alta e com cedilha;
    // a consulta usa "licenca de operacao" minúsculo e sem acento.
    const r = buscar('2910800', { nomeTipologia: B3_1 })
    assert.ok(r.length > 0)
  })

  it('devolve o trecho com os termos casados marcados', () => {
    const r = buscar('2910800', { nomeTipologia: B3_1 })
    assert.match(r[0].transcricao!, /«.+»/)
  })

  it('marca todo ato como não conferido e carrega url e data', () => {
    const r = buscar('2910800', { nomeTipologia: B3_1 })
    for (const a of r) {
      assert.equal(a.verificado, false)
      assert.equal(a.tipo, 'ato_diario_oficial')
      assert.match(a.url!, /^https:\/\//)
      assert.match(a.data!, /^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('município sem ato nenhum devolve lista vazia, sem lançar', () => {
    assert.deepEqual(buscar('2900000', { nomeTipologia: B3_1 }), [])
  })

  it('respeita o limite', () => {
    assert.ok(buscar('2910800', { nomeTipologia: B3_1, limite: 1 }).length <= 1)
  })

  it('ordena por BM25 crescente (menor = mais relevante)', () => {
    const r = buscar('2910800', { nomeTipologia: 'Gesso, Caulim e Saibro', limite: 10 })
    const scores = r.map((a) => a.bm25!)
    assert.deepEqual(scores, [...scores].sort((a, b) => a - b))
  })
})
