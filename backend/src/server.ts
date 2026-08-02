/**
 * Backend (Fase 2 do gap #1/#5 do ENTENDIMENTO_PROJETO.md).
 *
 * Não reimplementa o motor: importa `avaliar`/`construirFactBase` direto de
 * `frontend/src/lib` via alias `@/*` (ver tsconfig.json). Mesmo código que
 * roda no browser, mesma saída — o `Parecer` que sai daqui é byte-a-byte
 * comparável ao que a interface já produz sozinha.
 *
 * TIPOLOGIAS/MUNICIPIOS/REGRAS não vêm mais de `@/data/fixtures` (bundle
 * TS estático) — vêm de `./db.ts`, que lê direto do SQLite já populado por
 * `documentation/schema.sql`/`seed.sql`/`seed_regras.sql`. Nova lei de
 * competência = linha nova no banco, não código novo aqui.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'
import type { Request, Response } from 'express'

import { avaliar } from '@/lib/motor'
import { construirFactBase } from '@/lib/fatos'
import { TELEFONES } from '@/parecer/dados'
import { CONDICIONAIS_VAZIAS } from '@/state/tipos'
import type { EstadoFormulario } from '@/state/tipos'
import {
  carregarClasseImpacto,
  carregarConsorcioPorMunicipio,
  carregarLicencas,
  carregarMembrosConsorcio,
  carregarMunicipios,
  carregarNiveisGestao,
  carregarRegras,
  carregarTipologias,
  criarBuscador,
} from './db.ts'
import { ranquear } from './ranking.ts'
import type { BasesRanking } from './ranking.ts'
import type { EntradaRanking, IncidenciaEntrada } from './ranking-tipos.ts'

const TIPOLOGIAS = carregarTipologias()
const MUNICIPIOS = carregarMunicipios()
const REGRAS = carregarRegras()

/**
 * Bases do motor de ranking, carregadas uma vez no boot como TIPOLOGIAS/
 * MUNICIPIOS/REGRAS. Todas cabem em memória com folga: 9 linhas de classe,
 * 27 de nível, 19 licenças, 1.522 atos (os 2.008 menos os 486 de `cfem`).
 */
const BASES_RANKING: BasesRanking = {
  tipologias: TIPOLOGIAS,
  municipios: MUNICIPIOS,
  regras: REGRAS,
  classeImpacto: carregarClasseImpacto(),
  niveisGestao: carregarNiveisGestao(),
  licencas: carregarLicencas(),
  // Função, não Map: a consulta FTS5 roda por requisição (ver busca-atos.ts).
  buscarAtos: criarBuscador(),
  membrosConsorcio: carregarMembrosConsorcio(),
  consorcioPorMunicipio: carregarConsorcioPorMunicipio(),
  telefones: TELEFONES,
}

// ---------------------------------------------------------------------------
// Índice de poligonais — `proporcao` por município, que só o GeoJSON tem
// ---------------------------------------------------------------------------

const __dirname_ = path.dirname(fileURLToPath(import.meta.url))
const PROCESSOS_GEOJSON =
  process.env.PROCESSOS_GEOJSON ??
  path.resolve(__dirname_, '../../frontend/public/data/processos.geojson')

/**
 * `processo_norm` -> incidência municipal com `proporcao`.
 *
 * Vem do GeoJSON e não de `indice_processos.json` porque o índice degrada
 * `municipios` para uma lista de nomes (`pipeline/prep.py:367-381`), perdendo
 * justamente a `proporcao` — que é o insumo da detecção de dois estados.
 * Carrega a geometria junto (3,6 MB) e a descarta: ler duas vezes por causa
 * disso seria pior que o custo de boot.
 */
function carregarIncidencias(): Map<string, { nome: string; municipios: IncidenciaEntrada[] }> {
  const out = new Map<string, { nome: string; municipios: IncidenciaEntrada[] }>()
  if (!fs.existsSync(PROCESSOS_GEOJSON)) {
    console.warn(
      `[ranking] ${PROCESSOS_GEOJSON} não encontrado — POST /api/ranking exigirá ` +
        '`municipios[]` no corpo. Rode `python pipeline/prep.py` para gerá-lo.',
    )
    return out
  }
  const fc = JSON.parse(fs.readFileSync(PROCESSOS_GEOJSON, 'utf-8')) as {
    features: { properties: Record<string, unknown> }[]
  }
  for (const f of fc.features) {
    const p = f.properties
    out.set(String(p.processo_norm), {
      nome: String(p.processo),
      municipios: (p.municipios as IncidenciaEntrada[]).map((m) => ({
        cd_mun: m.cd_mun,
        nm_mun: m.nm_mun,
        proporcao: m.proporcao,
      })),
    })
  }
  return out
}

const INCIDENCIAS = carregarIncidencias()

/** "871.855/2021" e "8718552021" chegam à mesma chave. */
function normalizarProcesso(s: string): string {
  return s.replace(/\D/g, '')
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/tipologias', (_req: Request, res: Response) => {
  res.json(TIPOLOGIAS)
})

app.get('/api/tipologias/:id', (req: Request, res: Response) => {
  const t = TIPOLOGIAS.find((x) => x.id === req.params.id)
  if (!t) {
    res.status(404).json({ erro: `tipologia '${req.params.id}' não encontrada` })
    return
  }
  res.json(t)
})

app.get('/api/municipios', (req: Request, res: Response) => {
  const nome = typeof req.query.nome === 'string' ? req.query.nome : null
  if (!nome) {
    res.json(MUNICIPIOS)
    return
  }
  const alvo = normalizar(nome)
  res.json(MUNICIPIOS.filter((m) => normalizar(m.nm_mun).includes(alvo)))
})

app.get('/api/municipios/:cd_mun', (req: Request, res: Response) => {
  const m = MUNICIPIOS.find((x) => x.cd_mun === req.params.cd_mun)
  if (!m) {
    res.status(404).json({ erro: `município '${req.params.cd_mun}' não encontrado` })
    return
  }
  res.json(m)
})

/**
 * Entrada: um `EstadoFormulario` parcial (mesma forma que o formulário do
 * frontend produz). Saída: o `Parecer` completo do motor (D).
 */
app.post('/api/parecer', (req: Request, res: Response) => {
  const body = req.body as Partial<EstadoFormulario> | null | undefined
  if (!body || typeof body !== 'object') {
    res.status(400).json({ erro: 'corpo da requisição precisa ser um objeto EstadoFormulario' })
    return
  }

  const estado: EstadoFormulario = {
    origem: body.origem ?? 'nenhuma',
    processo: body.processo ?? null,
    area: body.area ?? null,
    tipologia_id: body.tipologia_id ?? null,
    substancia: body.substancia ?? '',
    substancia_editada: body.substancia_editada ?? false,
    fase: body.fase ?? '',
    fase_editada: body.fase_editada ?? false,
    porte_valor: body.porte_valor ?? null,
    condicionais: { ...CONDICIONAIS_VAZIAS, ...body.condicionais },
  }

  const fatos = construirFactBase(estado, { tipologias: TIPOLOGIAS, municipios: MUNICIPIOS })
  const parecer = avaliar(fatos, { regras: REGRAS, tipologias: TIPOLOGIAS })
  res.json(parecer)
})

/**
 * Motor de ranking (viabilidade de protocolo) — pergunta diferente de
 * `/api/parecer`, que responde competência legal. Ver o cabeçalho de
 * `ranking.ts` para por que as duas ordens de prioridade são opostas.
 *
 * Corpo:
 *   `{ processo, tipologia_codigo, producao, substancia?, data_referencia? }`
 *   ou `{ municipios: [{cd_mun, nm_mun, proporcao}], tipologia_codigo, producao, … }`
 *
 * `municipios[]` explícito vence o lookup por processo — é o caminho da
 * poligonal desenhada à mão, que não tem número de processo.
 */
app.post('/api/ranking', (req: Request, res: Response) => {
  const body = req.body as Partial<EntradaRanking> | null | undefined
  if (!body || typeof body !== 'object') {
    res.status(400).json({ erro: 'corpo da requisição precisa ser um objeto' })
    return
  }
  if (!body.tipologia_codigo || typeof body.producao !== 'number') {
    res.status(400).json({ erro: 'tipologia_codigo (string) e producao (number) são obrigatórios' })
    return
  }

  let municipios = body.municipios ?? null
  let processo = body.processo ?? null

  if (!municipios) {
    if (!processo) {
      res.status(400).json({ erro: 'informe `processo` ou `municipios[]`' })
      return
    }
    const achado = INCIDENCIAS.get(normalizarProcesso(processo))
    if (!achado) {
      res.status(404).json({ erro: `processo '${processo}' não encontrado no índice de poligonais` })
      return
    }
    municipios = achado.municipios
    processo = achado.nome
  }

  res.json(
    ranquear(
      {
        processo,
        municipios,
        tipologia_codigo: body.tipologia_codigo,
        producao: body.producao,
        substancia: body.substancia,
        data_referencia: body.data_referencia,
      },
      BASES_RANKING,
    ),
  )
})

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  console.log(`backend ouvindo em http://localhost:${PORT}`)
  console.log(`  ${TIPOLOGIAS.length} tipologias, ${MUNICIPIOS.length} municípios`)
  console.log(
    `  ranking: ${BASES_RANKING.licencas.length} licenças, ${INCIDENCIAS.size} poligonais ` +
      'indexadas, atos do diário via FTS5 por requisição',
  )
})
