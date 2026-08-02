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
import cors from 'cors'
import express from 'express'
import type { Request, Response } from 'express'

import { avaliar } from '@/lib/motor'
import { construirFactBase } from '@/lib/fatos'
import { CONDICIONAIS_VAZIAS } from '@/state/tipos'
import type { EstadoFormulario } from '@/state/tipos'
import { carregarMunicipios, carregarRegras, carregarTipologias } from './db.ts'

const TIPOLOGIAS = carregarTipologias()
const MUNICIPIOS = carregarMunicipios()
const REGRAS = carregarRegras()

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
})
