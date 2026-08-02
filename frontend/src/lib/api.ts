/**
 * Cliente do backend.
 *
 * O que fica de cada lado, e por quê:
 *
 *   competência (`Parecer`)  — calculada NO BROWSER, `motor.ts` + `fixtures.ts`
 *   ranking (viabilidade)    — calculado NO BACKEND, exige SQLite
 *
 * A divisão não é arbitrária. A tela de competência é o argumento central do
 * produto ("mude um campo, a resposta salta") e precisa responder no mesmo
 * frame, sem rede — é o que `documentation/CONTEXTO_PROJETO.md` chama de rodar
 * offline. Já o ranking precisa das 19 licenças, dos 29 consórcios e do índice
 * FTS5 sobre 2.008 atos do diário; nada disso cabe num bundle estático, e o
 * `node:sqlite` não roda no browser.
 *
 * Consequência assumida: **sem backend no ar, a tela continua funcionando** —
 * só o painel de ranking fica indisponível, com o motivo à vista. Nenhuma
 * chamada aqui pode derrubar o parecer.
 *
 * As URLs são relativas (`/api/...`) porque o Vite faz proxy para a 3001
 * (`vite.config.ts`). Em produção, servir o `dist/` atrás do mesmo host
 * resolve igual, sem recompilar.
 */
import type { EntradaRanking, RankingInstancias } from './ranking-tipos'
import type { IncidenciaMunicipal, Tipologia } from './schemas'

/** Passados 8s sem resposta, o backend é tratado como fora do ar. */
const TIMEOUT_MS = 8000

export type ResultadoRanking =
  | { estado: 'ok'; ranking: RankingInstancias }
  | { estado: 'indisponivel'; motivo: string }
  | { estado: 'incompleto'; motivo: string }

/**
 * Erro de rede, backend desligado, timeout e 5xx caem todos aqui. O texto vai
 * para a tela, então diz o que fazer — "backend fora do ar" sozinho não ajuda
 * quem está avaliando o projeto pela primeira vez.
 */
const MOTIVO_OFFLINE =
  'Backend não respondeu. O ranking precisa do SQLite (licenças, consórcios e ' +
  'índice de atos), que não roda no browser. Suba com `cd backend && npm run dev`.'

/** Backend inalcançável, por qualquer das formas que isso se manifesta. */
class ErroBackendFora extends Error {
  constructor() {
    super(MOTIVO_OFFLINE)
    this.name = 'ErroBackendFora'
  }
}

async function postar<T>(caminho: string, corpo: unknown): Promise<T> {
  const abortar = new AbortController()
  const relogio = setTimeout(() => abortar.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: abortar.signal,
    })
    if (!r.ok) {
      // 502/503/504 vêm do proxy do Vite quando não há ninguém na 3001 — do
      // ponto de vista do browser é resposta HTTP, não falha de rede, então
      // `fetch` NÃO rejeita e o caminho de erro abaixo nunca veria "Failed to
      // fetch". Sem este ramo, backend desligado apareceria como "respondeu
      // 502" em vez da instrução de como subir.
      if (r.status >= 502 && r.status <= 504) throw new ErroBackendFora()
      const detalhe = (await r.json().catch(() => null)) as { erro?: string } | null
      throw new Error(detalhe?.erro ?? `${caminho} respondeu ${r.status}`)
    }
    return (await r.json()) as T
  } finally {
    clearTimeout(relogio)
  }
}

/**
 * O que o motor de ranking precisa e o formulário nem sempre tem.
 *
 * `processo` e `municipios` são alternativos: com processo da ANM o backend
 * resolve a incidência municipal pelo próprio `processos.geojson` (que guarda
 * `proporcao`, coisa que `indice_processos.json` perde); com poligonal
 * desenhada, o frontend já calculou `IncidenciaMunicipal[]` via turf e manda
 * pronto.
 */
export interface PedidoRanking {
  processo: string | null
  municipios: IncidenciaMunicipal[] | null
  tipologia: Tipologia | null
  producao: number | null
  substancia: string
}

/**
 * Traduz o estado do formulário no corpo de `POST /api/ranking`, ou explica
 * por que ainda não dá para perguntar.
 *
 * Devolver `incompleto` em vez de disparar a chamada evita 400 previsível a
 * cada tecla digitada no campo de porte.
 */
export function montarEntrada(p: PedidoRanking): EntradaRanking | { falta: string } {
  if (!p.tipologia) return { falta: 'Escolha a tipologia para ver o ranking de instâncias.' }
  // `Tipologia.codigo` é anulável no schema, e o ranking é indexado por código
  // CEPRAM (a porta do passo 3a cruza `tipologia_codigo|nivel`). Sem código não
  // há como consultar — dizer isso é melhor que mandar `null` e levar 400.
  if (!p.tipologia.codigo) {
    return { falta: `A tipologia "${p.tipologia.atividade}" não tem código CEPRAM na base.` }
  }
  if (p.producao === null || !Number.isFinite(p.producao)) {
    return { falta: 'Informe a produção para ver o ranking de instâncias.' }
  }
  if (!p.processo && (!p.municipios || p.municipios.length === 0)) {
    return { falta: 'Busque um processo da ANM ou desenhe a poligonal.' }
  }
  return {
    processo: p.processo,
    // O backend só usa `cd_mun`/`nm_mun`/`proporcao`; `area_ha` fica de fora
    // para o corpo não carregar campo que ninguém lê do outro lado.
    municipios: (p.municipios ?? []).map((m) => ({
      cd_mun: m.cd_mun,
      nm_mun: m.nm_mun,
      proporcao: m.proporcao,
    })),
    tipologia_codigo: p.tipologia.codigo,
    producao: p.producao,
    substancia: p.substancia || undefined,
  }
}

export async function buscarRanking(p: PedidoRanking): Promise<ResultadoRanking> {
  const entrada = montarEntrada(p)
  if ('falta' in entrada) return { estado: 'incompleto', motivo: entrada.falta }

  // Corpo sem `municipios` quando a lista está vazia: o backend trata
  // `municipios: []` como lista explícita e não cai no lookup por processo.
  const corpo =
    entrada.municipios.length > 0 ? entrada : { ...entrada, municipios: undefined }

  try {
    return { estado: 'ok', ranking: await postar<RankingInstancias>('/api/ranking', corpo) }
  } catch (e) {
    if (e instanceof ErroBackendFora) return { estado: 'indisponivel', motivo: MOTIVO_OFFLINE }
    const msg = e instanceof Error ? e.message : String(e)
    // Backend fora do ar chega de três formas: 502/503/504 do proxy do Vite
    // (tratado acima), `TypeError: Failed to fetch` sem proxy, e `AbortError`
    // no estouro do timeout. Um 400/404 do próprio backend NÃO é queda — dizer
    // "suba o backend" nesse caso mandaria depurar a coisa errada.
    const caiu =
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      (e instanceof Error && e.name === 'AbortError')
    return { estado: 'indisponivel', motivo: caiu ? MOTIVO_OFFLINE : msg }
  }
}
