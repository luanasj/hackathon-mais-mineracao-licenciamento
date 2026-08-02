/**
 * Fonte de dados do backend (Fase 3 do gap #1 do ENTENDIMENTO_PROJETO.md).
 *
 * Lê direto de `data/db/licenciamento.db` (cópia local do SQLite que
 * `docker compose up` já mantém populado a partir de `documentation/schema.sql`
 * + `seed.sql` + `seed_regras.sql`). `fixtures.ts` deixa de ser fonte de
 * TIPOLOGIAS/MUNICIPIOS/REGRAS para o backend — só o frontend (SPA estático,
 * sem acesso a banco) continua usando o bundle TS.
 *
 * Nova lei de competência = INSERT nas tabelas `regra`/`regra_condicao`/
 * `regra_alerta` (ver documentation/schema.sql), nunca uma `Regra` nova
 * escrita em código.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import type {
  FaixaTipologia,
  MunicipioHabilitacao,
  Predicado,
  Regra,
  Tipologia,
} from '@/lib/schemas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, '../../data/db/licenciamento.db')

const db = new DatabaseSync(DB_PATH, { readOnly: true })

function bool(v: number): boolean {
  return v === 1
}

/** "B3.1" -> "b3-1". Mesma convenção usada por scripts/build_fixtures.py. */
function slugCodigo(codigo: string): string {
  return 'b' + codigo.slice(1).replace(/\./g, '-').toLowerCase()
}

const POTENCIAL: Record<string, Tipologia['potencial_poluente']> = {
  A: 'grande',
  M: 'medio',
  P: 'pequeno',
}

function faixasDe(row: {
  porte_pequeno_limite_superior: number
  porte_medio_limite_superior: number
  porte_grande_limite_inferior: number
}): FaixaTipologia[] {
  return [
    { faixa: 'pequeno', min: 0, max: row.porte_pequeno_limite_superior },
    { faixa: 'medio', min: row.porte_pequeno_limite_superior, max: row.porte_medio_limite_superior },
    { faixa: 'grande', min: row.porte_grande_limite_inferior, max: null },
  ]
}

function camposCondicionais(nomeAtividade: string): string[] {
  const campos = ['supressao_vegetacao', 'explosivos']
  if (nomeAtividade.includes('Recursos Hídricos')) campos.splice(1, 0, 'recurso_hidrico')
  return campos
}

// ---------------------------------------------------------------------------
// TIPOLOGIAS — Resolução CEPRAM 4.327/2013, Divisão B (grupos presentes no banco)
// ---------------------------------------------------------------------------

interface TipologiaRow {
  codigo: string
  grupo_codigo: string
  grupo_nome: string
  nome: string
  potencial_poluidor: string
  porte_pequeno_limite_superior: number
  porte_medio_limite_superior: number
  porte_grande_limite_inferior: number
  pagina_fonte: string | null
}

export function carregarTipologias(): Tipologia[] {
  const fonte = db.prepare('SELECT resolucao FROM fonte_cepram LIMIT 1').get() as
    | { resolucao: string }
    | undefined
  const norma = fonte?.resolucao ?? 'Resolução CEPRAM 4.327/2013'

  const rows = db
    .prepare(
      `SELECT t.codigo, t.grupo_codigo, g.nome AS grupo_nome, t.nome,
              t.potencial_poluidor, t.porte_pequeno_limite_superior,
              t.porte_medio_limite_superior, t.porte_grande_limite_inferior,
              t.pagina_fonte
       FROM tipologia t JOIN tipologia_grupo g ON g.codigo = t.grupo_codigo
       ORDER BY t.codigo`,
    )
    .all() as unknown as TipologiaRow[]

  return rows.map((r) => ({
    id: slugCodigo(r.codigo),
    codigo: r.codigo,
    atividade: r.nome,
    grupo: `Divisão B — Mineração · ${r.grupo_nome} (${r.grupo_codigo})`,
    parametro_porte: 'produção bruta',
    unidade_porte: 't/ano',
    faixas: faixasDe(r),
    potencial_poluente: POTENCIAL[r.potencial_poluidor] ?? 'medio',
    campos_condicionais: camposCondicionais(r.nome),
    fundamento: {
      norma,
      dispositivo: `Anexo Único — Divisão B: Mineração, ${r.codigo} (pág. ${r.pagina_fonte} do PDF oficial)`,
      verificado: true,
      data_conferencia: '2026-08-01',
    },
  }))
}

// ---------------------------------------------------------------------------
// MUNICIPIOS — habilitação GAC vigente (view municipio_habilitacao_atual)
// ---------------------------------------------------------------------------

interface NivelGestaoRow {
  tipologia_codigo: string
  nivel: number // coluna INTEGER; habilitacao_gac.nivel é TEXT — normalizado em carregarMunicipios
}

interface MunicipioRow {
  codigo_ibge: string
  nome: string
  status: MunicipioHabilitacao['status']
  nivel: string | null
  fonte_url: string
  data_consulta: string
  consorcio_nome: string | null
}

export function carregarMunicipios(): MunicipioHabilitacao[] {
  const delegadasPorNivel = new Map<string, string[]>()
  const niveisRows = db
    .prepare(
      `SELECT tipologia_codigo, nivel FROM tipologia_nivel_gestao
       WHERE classes_autorizadas IS NOT NULL`,
    )
    .all() as unknown as NivelGestaoRow[]
  for (const row of niveisRows) {
    // tipologia_nivel_gestao.nivel é INTEGER (schema.sql); habilitacao_gac.nivel
    // é TEXT — normaliza pra string aqui pra as duas pontas baterem na Map.
    const chave = String(row.nivel)
    const lista = delegadasPorNivel.get(chave) ?? []
    lista.push(slugCodigo(row.tipologia_codigo))
    delegadasPorNivel.set(chave, lista)
  }

  const rows = db
    .prepare(
      `SELECT h.codigo_ibge, m.nome, h.status, h.nivel, h.fonte_url, h.data_consulta,
              c.nome AS consorcio_nome
       FROM municipio_habilitacao_atual h
       JOIN municipio m ON m.codigo_ibge = h.codigo_ibge
       LEFT JOIN consorcio c ON c.consorcio_id = h.consorcio_id
       ORDER BY m.nome`,
    )
    .all() as unknown as MunicipioRow[]

  return rows.map((r) => ({
    cd_mun: r.codigo_ibge,
    nm_mun: r.nome,
    status: r.status,
    nivel: r.nivel,
    tipologias_delegadas: r.nivel ? delegadasPorNivel.get(r.nivel) ?? [] : [],
    ato: null,
    vigencia_desde: null,
    procedencia: {
      fonte: `GAC/SEMA-BA — ${r.consorcio_nome ?? 'sem consórcio vinculado'}`,
      url: r.fonte_url,
      data_consulta: r.data_consulta,
    },
  }))
}

// ---------------------------------------------------------------------------
// REGRAS — competência (Escopo D). Fonte única a partir de agora: as tabelas
// `regra`/`regra_condicao`/`regra_alerta` (documentation/schema.sql).
// ---------------------------------------------------------------------------

interface RegraRow {
  id: string
  descricao: string
  instancia: Regra['efeito']['instancia']
  orgao: Regra['efeito']['orgao']
  precedencia: number | null
  torna_condicional: number
  exige_fato: string | null
  trilhas_elegiveis: string | null
  anuencias: string | null
  fundamento_norma: string
  fundamento_dispositivo: string
  fundamento_verificado: number
  fundamento_data_conferencia: string | null
  prioridade: Regra['prioridade'] | null
}

interface CondicaoRow {
  regra_id: string
  fato: string
  operador: Predicado['operador']
  valor: string | null
  negado: number
}

interface AlertaRow {
  regra_id: string
  alerta_id: string
  severidade: 'info' | 'atencao' | 'critico'
  titulo: string
  detalhe: string
}

export function carregarRegras(): Regra[] {
  const regras = db.prepare('SELECT * FROM regra ORDER BY rowid').all() as unknown as RegraRow[]
  const condicoes = db
    .prepare('SELECT * FROM regra_condicao ORDER BY regra_id, ordem')
    .all() as unknown as CondicaoRow[]
  const alertas = db
    .prepare('SELECT * FROM regra_alerta ORDER BY regra_id, ordem')
    .all() as unknown as AlertaRow[]

  const condicoesPorRegra = new Map<string, Predicado[]>()
  for (const c of condicoes) {
    const lista = condicoesPorRegra.get(c.regra_id) ?? []
    lista.push({
      fato: c.fato,
      operador: c.operador,
      valor: c.valor !== null ? JSON.parse(c.valor) : undefined,
      negado: bool(c.negado) || undefined,
    })
    condicoesPorRegra.set(c.regra_id, lista)
  }

  const alertasPorRegra = new Map<string, AlertaRow[]>()
  for (const a of alertas) {
    const lista = alertasPorRegra.get(a.regra_id) ?? []
    lista.push(a)
    alertasPorRegra.set(a.regra_id, lista)
  }

  return regras.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    condicoes: condicoesPorRegra.get(r.id) ?? [],
    efeito: {
      instancia: r.instancia,
      orgao: r.orgao,
      precedencia: r.precedencia ?? undefined,
      trilhas_elegiveis: r.trilhas_elegiveis ? JSON.parse(r.trilhas_elegiveis) : undefined,
      anuencias: r.anuencias ? JSON.parse(r.anuencias) : undefined,
      alertas: alertasPorRegra
        .get(r.id)
        ?.map((a) => ({
          id: a.alerta_id,
          severidade: a.severidade,
          titulo: a.titulo,
          detalhe: a.detalhe,
        })),
    },
    torna_condicional: bool(r.torna_condicional) || undefined,
    exige_fato: r.exige_fato ? JSON.parse(r.exige_fato) : undefined,
    fundamento: {
      norma: r.fundamento_norma,
      dispositivo: r.fundamento_dispositivo,
      verificado: bool(r.fundamento_verificado),
      data_conferencia: r.fundamento_data_conferencia ?? undefined,
    },
    prioridade: r.prioridade ?? undefined,
  }))
}
