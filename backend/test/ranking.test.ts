/**
 * Testes do motor de ranking. Bases 100% injetadas — não abre o SQLite, não
 * sobe servidor, não depende de `data/db/licenciamento.db` existir. O mesmo
 * motivo pelo qual `avaliar(fatos, opts)` aceita `regras`/`tipologias`:
 * mecânica testada contra dado controlado, não contra o seed do dia.
 *
 * `data_referencia` é fixa em todos os casos. Sem isso a suíte quebraria
 * sozinha quando as janelas de 18/24 meses passassem por cima das licenças
 * reais de 2025/2026 — teste que envelhece é teste que mente.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MunicipioHabilitacao, Regra, Tipologia } from '@/lib/schemas'

import type { BuscadorAtos } from '../src/busca-atos.ts'
import type { LicencaConcedida } from '../src/db.ts'
import {
  classesAutorizadas,
  numeroDaClasse,
  ranquear,
  subtrairMeses,
  type BasesRanking,
} from '../src/ranking.ts'
import type { EntradaRanking, LeiRelacionada } from '@/lib/ranking-tipos'

const HOJE = '2026-08-02'

// ---------------------------------------------------------------------------
// Fixtures — espelham a forma real de db.ts, com números reais da CEPRAM
// ---------------------------------------------------------------------------

const B3_1: Tipologia = {
  id: 'b3-1',
  codigo: 'B3.1',
  atividade: 'Areias, Arenoso, Cascalhos, Filitos',
  grupo: 'Divisão B — Mineração · Construção civil (B3)',
  parametro_porte: 'produção bruta',
  unidade_porte: 't/ano',
  faixas: [
    { faixa: 'pequeno', min: 0, max: 75000 },
    { faixa: 'medio', min: 75000, max: 375000 },
    { faixa: 'grande', min: 375000, max: null },
  ],
  potencial_poluente: 'medio',
  campos_condicionais: ['supressao_vegetacao', 'explosivos'],
  fundamento: { norma: 'Resolução CEPRAM 4.327/2013', dispositivo: 'B3.1', verificado: true },
}

/** Potencial ALTO — nível 1 não licencia (classes_autorizadas NULL no banco). */
const B4_2: Tipologia = {
  ...B3_1,
  id: 'b4-2',
  codigo: 'B4.2',
  atividade: 'Cianita, Feldspato, Quartzo e outros',
  faixas: [
    { faixa: 'pequeno', min: 0, max: 20000 },
    { faixa: 'medio', min: 20000, max: 200000 },
    { faixa: 'grande', min: 200000, max: null },
  ],
  potencial_poluente: 'grande',
  fundamento: { norma: 'Resolução CEPRAM 4.327/2013', dispositivo: 'B4.2', verificado: true },
}

function municipio(
  cd: string,
  nome: string,
  nivel: string | null,
  status: MunicipioHabilitacao['status'] = 'habilitado',
): MunicipioHabilitacao {
  return {
    cd_mun: cd,
    nm_mun: nome,
    status,
    nivel,
    tipologias_delegadas: [],
    ato: null,
    vigencia_desde: null,
    procedencia: { fonte: 'fixture', data_consulta: HOJE },
  }
}

const REGRA_URANIO: Regra = {
  id: 'federal-substancia-nuclear',
  descricao: 'Minério de urânio atrai a competência federal',
  condicoes: [{ fato: 'substancia', operador: 'contem', valor: 'URÂNIO' }],
  efeito: { instancia: 'UNIAO', orgao: 'IBAMA' },
  fundamento: { norma: 'LC 140/2011', dispositivo: 'Art. 7º, XIV, "g"', verificado: false },
}

function licenca(cd: string, nome: string, data: string): LicencaConcedida {
  return {
    codigo_ibge: cd,
    municipio_nome: nome,
    consorcio_id: '15198',
    data_concessao: data,
    licenciado_por: 'municipio_proprio',
    numero_licenca: `Processo 001/${data.slice(0, 4)}`,
    fonte_urls: ['https://exemplo'],
  }
}

function ato(relevancia: 'alta' | 'media'): LeiRelacionada {
  return {
    tipo: 'ato_diario_oficial',
    norma: 'Ato publicado em diário oficial municipal',
    dispositivo: 'Edição de 2025-06-01',
    transcricao: '…concede «Licença» de «Operação» para extração de «areia»…',
    url: 'https://exemplo/ato',
    verificado: false,
    termo_encontrado: 'licenciamento ambiental',
    data: '2025-06-01',
    relevancia,
    bm25: -1.23,
    termos_consultados: relevancia === 'alta' ? ['areia', 'cascalho'] : [],
  }
}

/**
 * Buscador falso. O motor recebe uma FUNÇÃO, não um Map — então o teste controla
 * a resposta por município sem tocar em SQLite nem no índice FTS5.
 */
function buscadorFake(porMunicipio: Record<string, LeiRelacionada[]>): BuscadorAtos {
  return (cd) => porMunicipio[cd] ?? []
}

/** Jacobina (licenciou sozinha) e Caém (só via consórcio) — ambas 15198. */
function bases(over: Partial<BasesRanking> = {}): BasesRanking {
  return {
    tipologias: [B3_1, B4_2],
    municipios: [
      municipio('2917508', 'Jacobina', '3'),
      municipio('2905107', 'Caém', '3'),
      municipio('2921203', 'Miguel Calmon', null, 'nao_habilitado'),
      municipio('2906006', 'Campo Formoso', '1'),
      municipio('2999999', 'Vila Sem Licença', '3'),
    ],
    regras: [REGRA_URANIO],
    classeImpacto: new Map([
      ['pequeno|pequeno', 'Classe 1'],
      ['pequeno|medio', 'Classe 1'],
      ['pequeno|alto', 'Classe 3'],
      ['medio|pequeno', 'Classe 2'],
      ['medio|medio', 'Classe 3'],
      ['medio|alto', 'Classe 5'],
      ['grande|pequeno', 'Classe 4'],
      ['grande|medio', 'Classe 5'],
      ['grande|alto', 'Classe 6'],
    ]),
    niveisGestao: new Map<string, string | null>([
      ['B3.1|1', 'C1'],
      ['B3.1|2', 'C1'],
      ['B3.1|3', 'C1 e C3'],
      ['B4.2|1', null],
      ['B4.2|2', 'C3'],
      ['B4.2|3', 'C3 E C5'],
    ]),
    licencas: [licenca('2917508', 'Jacobina', '2026-01-13')],
    buscarAtos: buscadorFake({ '2917508': [ato('alta')] }),
    membrosConsorcio: new Map([['15198', ['2905107', '2917508', '2921203']]]),
    consorcioPorMunicipio: new Map([
      ['2917508', '15198'],
      ['2905107', '15198'],
      ['2921203', '15198'],
    ]),
    telefones: {
      'INEMA — Licenciamento': '(71) 3118-4000',
      'IBAMA — Superintendência na Bahia': '(71) 3117-1000',
    },
    ...over,
  }
}

function entrada(over: Partial<EntradaRanking> = {}): EntradaRanking {
  return {
    processo: '871.855/2021',
    municipios: [{ cd_mun: '2917508', nm_mun: 'Jacobina', proporcao: 1.0 }],
    tipologia_codigo: 'B3.1',
    producao: 50000,
    data_referencia: HOJE,
    ...over,
  }
}

/** Posição de uma instância no ranking, ou `null` se desclassificada. */
function pos(r: ReturnType<typeof ranquear>, inst: string): number | null {
  return r.ranking.find((x) => x.instancia === inst)?.posicao ?? null
}

function desclassificada(r: ReturnType<typeof ranquear>, inst: string): boolean {
  return r.desclassificados.some((x) => x.instancia === inst)
}

function codigos(r: ReturnType<typeof ranquear>, inst: string): string[] {
  const alvo =
    r.ranking.find((x) => x.instancia === inst) ??
    r.desclassificados.find((x) => x.instancia === inst)
  return alvo?.motivos.map((m) => m.codigo) ?? []
}

// ---------------------------------------------------------------------------

describe('utilidades', () => {
  it('classesAutorizadas lê "C1 e C3" e o "C3 E C5" com E maiúsculo do PDF', () => {
    assert.deepEqual(classesAutorizadas('C1'), [1])
    assert.deepEqual(classesAutorizadas('C1 e C3'), [1, 3])
    assert.deepEqual(classesAutorizadas('C3 E C5'), [3, 5])
  })

  it('classesAutorizadas trata null como "nível não licencia", não como erro', () => {
    assert.deepEqual(classesAutorizadas(null), [])
    assert.deepEqual(classesAutorizadas(undefined), [])
  })

  it('numeroDaClasse extrai o dígito', () => {
    assert.equal(numeroDaClasse('Classe 3'), 3)
    assert.equal(numeroDaClasse('Classe 6'), 6)
  })

  it('subtrairMeses recua a janela', () => {
    assert.equal(subtrairMeses('2026-08-02', 24), '2024-08-02')
    assert.equal(subtrairMeses('2026-08-02', 18), '2025-02-02')
  })
})

describe('passo 0 — trava de competência federal', () => {
  it('urânio derruba município e estado, independentemente do porte', () => {
    const r = ranquear(entrada({ substancia: 'MINÉRIO DE URÂNIO' }), bases())
    assert.equal(pos(r, 'FEDERAL'), 1)
    assert.equal(r.ranking.length, 1)
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.ok(desclassificada(r, 'ESTADUAL'))
    assert.ok(codigos(r, 'FEDERAL').includes('competencia_federal_absoluta'))
  })

  it('cita o Art. 7º, XIV, "g" da LC 140/2011', () => {
    const r = ranquear(entrada({ substancia: 'MINÉRIO DE URÂNIO' }), bases())
    const leis = r.ranking[0].leis
    assert.ok(leis.some((l) => l.dispositivo === 'Art. 7º, XIV, "g"' && l.verificado))
  })

  it('substância comum não aciona a trava', () => {
    const r = ranquear(entrada({ substancia: 'CASCALHO' }), bases())
    assert.equal(pos(r, 'MUNICIPAL'), 1)
  })
})

describe('passo 1 — poligonal em dois ou mais estados', () => {
  it('cobertura BA abaixo do limiar deixa só a federação', () => {
    const r = ranquear(
      entrada({
        processo: '870.100/2018',
        municipios: [{ cd_mun: '2928406', nm_mun: 'Santa Rita de Cássia', proporcao: 0.0022 }],
      }),
      bases(),
    )
    assert.equal(pos(r, 'FEDERAL'), 1)
    assert.equal(r.ranking.length, 1)
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.ok(desclassificada(r, 'ESTADUAL'))
    assert.ok(r.avisos.some((a) => a.startsWith('cobertura_ba_incompleta')))
  })

  it('cita o Art. 7º, XIV, "e" — dois ou mais Estados', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2928406', nm_mun: 'X', proporcao: 0.5 }] }),
      bases(),
    )
    assert.ok(r.ranking[0].leis.some((l) => l.dispositivo === 'Art. 7º, XIV, "e"'))
  })

  it('déficit dentro do ruído de fronteira (0,5%) NÃO vira dois estados', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2917508', nm_mun: 'Jacobina', proporcao: 0.995 }] }),
      bases(),
    )
    assert.equal(pos(r, 'MUNICIPAL'), 1)
  })
})

describe('passo 2 — poligonal em dois ou mais municípios', () => {
  it('desclassifica o município e ranqueia estado, federação', () => {
    const r = ranquear(
      entrada({
        processo: '1341/1935',
        municipios: [
          { cd_mun: '2906006', nm_mun: 'Campo Formoso', proporcao: 0.9895 },
          { cd_mun: '2901809', nm_mun: 'Antônio Gonçalves', proporcao: 0.0105 },
        ],
      }),
      bases(),
    )
    assert.equal(pos(r, 'ESTADUAL'), 1)
    assert.equal(pos(r, 'FEDERAL'), 2)
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.ok(codigos(r, 'MUNICIPAL').includes('poligonal_em_dois_municipios'))
  })

  it('marca a leitura como interpretação, não como dispositivo expresso', () => {
    const r = ranquear(
      entrada({
        municipios: [
          { cd_mun: '2906006', nm_mun: 'Campo Formoso', proporcao: 0.5 },
          { cd_mun: '2901809', nm_mun: 'Antônio Gonçalves', proporcao: 0.5 },
        ],
      }),
      bases(),
    )
    const motivo = r.desclassificados
      .find((x) => x.instancia === 'MUNICIPAL')!
      .motivos.find((m) => m.codigo === 'poligonal_em_dois_municipios')!
    assert.equal(motivo.fundamento!.verificado, false)
  })
})

describe('passo 3a — porta CEPRAM/GAC', () => {
  it('nível 1 não licencia B4.2 em classe nenhuma: município desclassificado', () => {
    const r = ranquear(
      entrada({
        municipios: [{ cd_mun: '2906006', nm_mun: 'Campo Formoso', proporcao: 1 }],
        tipologia_codigo: 'B4.2',
        producao: 10000,
      }),
      bases(),
    )
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.equal(pos(r, 'ESTADUAL'), 1)
    assert.equal(pos(r, 'FEDERAL'), 2)
    assert.ok(codigos(r, 'MUNICIPAL').includes('tipologia_nao_delegada_ao_nivel'))
  })

  it('classe acima do que o nível autoriza desclassifica o município', () => {
    // B3.1 potencial médio, produção 400.000 t/ano -> porte grande -> Classe 5.
    // Nível 3 só autoriza C1 e C3.
    const r = ranquear(entrada({ producao: 400000 }), bases())
    assert.equal(r.entrada.faixa_porte, 'grande')
    assert.equal(r.entrada.classe, 'Classe 5')
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.ok(codigos(r, 'MUNICIPAL').includes('classe_acima_do_nivel'))
  })

  it('município não habilitado é desclassificado', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2921203', nm_mun: 'Miguel Calmon', proporcao: 1 }] }),
      bases(),
    )
    assert.ok(desclassificada(r, 'MUNICIPAL'))
    assert.ok(codigos(r, 'MUNICIPAL').includes('municipio_nao_habilitado'))
  })

  it('município fora da base vira sem_evidencia, nunca nao_habilitado', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2900000', nm_mun: 'Fora da Base', proporcao: 1 }] }),
      bases(),
    )
    const motivo = r.desclassificados
      .find((x) => x.instancia === 'MUNICIPAL')!
      .motivos.find((m) => m.codigo === 'municipio_nao_habilitado')!
    assert.match(motivo.texto, /sem_evidencia/)
  })

  it('avisa que o mapa nível→classe não foi conferido', () => {
    const r = ranquear(entrada(), bases())
    assert.ok(r.avisos.some((a) => a.startsWith('nivel_classe_nao_conferido')))
  })
})

describe('passo 3b — capacidade técnica', () => {
  it('município que licenciou sozinho fica em 1º', () => {
    const r = ranquear(entrada(), bases())
    assert.equal(pos(r, 'MUNICIPAL'), 1)
    assert.equal(pos(r, 'ESTADUAL'), 2)
    assert.equal(pos(r, 'FEDERAL'), 3)
    assert.ok(codigos(r, 'MUNICIPAL').includes('licenciou_por_conta_propria'))
  })

  it('município que nunca licenciou herda a capacidade do consórcio', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2905107', nm_mun: 'Caém', proporcao: 1 }] }),
      bases(),
    )
    assert.equal(pos(r, 'MUNICIPAL'), 1)
    assert.ok(codigos(r, 'MUNICIPAL').includes('consorcio_com_licenciamento_recente'))
    const motivo = r.ranking
      .find((x) => x.instancia === 'MUNICIPAL')!
      .motivos.find((m) => m.codigo === 'consorcio_com_licenciamento_recente')!
    assert.match(motivo.texto, /Jacobina/)
  })

  it('herança de consórcio sai com o aviso de inferência fraca', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2905107', nm_mun: 'Caém', proporcao: 1 }] }),
      bases(),
    )
    assert.ok(r.avisos.some((a) => a.startsWith('consorcio_inferido_de_licenca_municipal')))
  })

  it('sem evidência nenhuma: estado 1º, município 2º, federação 3º', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2999999', nm_mun: 'Vila Sem Licença', proporcao: 1 }] }),
      bases(),
    )
    assert.equal(pos(r, 'ESTADUAL'), 1)
    assert.equal(pos(r, 'MUNICIPAL'), 2)
    assert.equal(pos(r, 'FEDERAL'), 3)
    assert.ok(codigos(r, 'MUNICIPAL').includes('sem_evidencia_de_licenciamento'))
  })

  it('a demoção é redigida como ausência de evidência, não como falta de técnico', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2999999', nm_mun: 'Vila Sem Licença', proporcao: 1 }] }),
      bases(),
    )
    const motivo = r.ranking
      .find((x) => x.instancia === 'MUNICIPAL')!
      .motivos.find((m) => m.codigo === 'sem_evidencia_de_licenciamento')!
    assert.match(motivo.texto, /Sem evidência de licenciamento na base/)
    assert.doesNotMatch(motivo.texto, /corpo técnico|não tem técnico/)
    assert.equal(r.ranking.find((x) => x.instancia === 'MUNICIPAL')!.confianca, 'baixa')
  })

  it('licença fora da janela de 24 meses não conta', () => {
    const r = ranquear(
      entrada(),
      bases({ licencas: [licenca('2917508', 'Jacobina', '2023-01-13')] }),
    )
    assert.equal(pos(r, 'ESTADUAL'), 1)
    assert.equal(pos(r, 'MUNICIPAL'), 2)
  })

  it('licença de irmão de consórcio fora da janela de 18 meses não conta', () => {
    const r = ranquear(
      entrada({ municipios: [{ cd_mun: '2905107', nm_mun: 'Caém', proporcao: 1 }] }),
      // 2025-01-01 está dentro dos 24 meses, fora dos 18 (limite 2025-02-02)
      bases({ licencas: [licenca('2917508', 'Jacobina', '2025-01-01')] }),
    )
    assert.equal(pos(r, 'MUNICIPAL'), 2)
  })
})

describe('saída', () => {
  it('devolve leis e contatos para as três instâncias', () => {
    const r = ranquear(entrada(), bases())
    for (const inst of r.ranking) {
      assert.ok(inst.leis.length > 0, `${inst.instancia} sem leis`)
      assert.ok(inst.contatos.orgao.length > 0)
    }
  })

  it('município devolve os atos do diário oficial junto das normas', () => {
    const r = ranquear(entrada(), bases())
    const leis = r.ranking.find((x) => x.instancia === 'MUNICIPAL')!.leis
    assert.ok(leis.some((l) => l.tipo === 'ato_diario_oficial'))
    assert.ok(leis.some((l) => l.tipo === 'norma'))
  })

  it('ato de alta relevância leva a confiança do município a alta', () => {
    const r = ranquear(entrada(), bases())
    assert.equal(r.ranking.find((x) => x.instancia === 'MUNICIPAL')!.confianca, 'alta')
  })

  it('ato só de relevância média mantém a confiança em media', () => {
    const r = ranquear(entrada(), bases({ buscarAtos: buscadorFake({ '2917508': [ato('media')] }) }))
    assert.equal(r.ranking.find((x) => x.instancia === 'MUNICIPAL')!.confianca, 'media')
  })

  it('a busca de atos NÃO muda a posição — só evidência e confiança (decisão 2)', () => {
    const comAtos = ranquear(entrada(), bases())
    const semAtos = ranquear(entrada(), bases({ buscarAtos: buscadorFake({}) }))
    assert.deepEqual(
      comAtos.ranking.map((x) => [x.instancia, x.posicao]),
      semAtos.ranking.map((x) => [x.instancia, x.posicao]),
    )
    assert.notEqual(
      comAtos.ranking.find((x) => x.instancia === 'MUNICIPAL')!.confianca,
      semAtos.ranking.find((x) => x.instancia === 'MUNICIPAL')!.confianca,
    )
  })

  it('não consulta atos quando a poligonal cruza divisa (município desclassificado)', () => {
    let chamadas = 0
    const r = ranquear(
      entrada({
        municipios: [
          { cd_mun: '2906006', nm_mun: 'Campo Formoso', proporcao: 0.5 },
          { cd_mun: '2901809', nm_mun: 'Antônio Gonçalves', proporcao: 0.5 },
        ],
      }),
      bases({
        buscarAtos: (() => {
          chamadas++
          return []
        }) as BuscadorAtos,
      }),
    )
    assert.equal(chamadas, 0)
    assert.ok(r.desclassificados.some((x) => x.instancia === 'MUNICIPAL'))
  })

  it('avisa que os atos são excertos, não leis', () => {
    const r = ranquear(entrada(), bases())
    assert.ok(r.avisos.some((a) => a.startsWith('atos_sao_excertos_nao_leis')))
  })

  it('contato municipal é null com motivo, nunca placeholder', () => {
    const r = ranquear(entrada(), bases())
    const c = r.ranking.find((x) => x.instancia === 'MUNICIPAL')!.contatos
    assert.equal(c.telefone, null)
    assert.equal(c.email, null)
    assert.match(c.motivo!, /não levantado/)
    assert.equal(c.acao_sugerida, 'gerar_pedido_lai')
  })

  it('telefones de estado e federação saem marcados como não conferidos', () => {
    const r = ranquear(entrada(), bases())
    for (const inst of ['ESTADUAL', 'FEDERAL']) {
      const c = r.ranking.find((x) => x.instancia === inst)!.contatos
      assert.equal(typeof c.telefone, 'string')
      assert.equal(c.email, null)
      assert.equal(c.verificado, false)
    }
  })

  it('avisa quando a janela é mais longa que a base de licenças', () => {
    const r = ranquear(entrada(), bases())
    assert.ok(r.avisos.some((a) => a.startsWith('janela_maior_que_a_base')))
  })

  it('avisa quando a tipologia não está na base (grupos B1/B2 ausentes)', () => {
    const r = ranquear(entrada({ tipologia_codigo: 'B1.1.3' }), bases())
    assert.ok(r.avisos.some((a) => a.startsWith('tipologia_desconhecida')))
  })

  it('ranking sai ordenado por posição', () => {
    const r = ranquear(entrada(), bases())
    const posicoes = r.ranking.map((x) => x.posicao)
    assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a! - b!))
  })
})
