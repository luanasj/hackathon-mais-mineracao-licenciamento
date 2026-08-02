/**
 * ESCOPO B ↔ D — o adaptador que separa formulário de motor (contrato D.1).
 *
 * Nenhuma regra lê o formulário direto. O formulário produz fatos; o motor
 * consome fatos. Trocar a interface inteira não obriga a tocar em uma regra, e
 * trocar as regras não obriga a tocar em um campo.
 *
 * Três origens, conforme o schema:
 *   `cadastro`  — veio do SIGMINE/ANM, não foi digitado por ninguém
 *   `derivado`  — foi calculado (interseção geométrica, faixa de porte, join)
 *   `declarado` — o usuário afirmou
 *
 * ⚠️ Junção com a base de habilitação é por NOME do município, e não por código
 * IBGE: o índice de busca de A.5 carrega só o nome. Os nomes vêm da malha IBGE
 * 2025 dos dois lados, então a junção é estável — C.2 mantém `nm_mun` idêntico.
 */

import { MUNICIPIOS, TIPOLOGIAS } from '@/data/fixtures'
import { faixaDe } from '@/lib/porte'
import type {
  FactBase,
  Fato,
  MunicipioHabilitacao,
  Procedencia,
  StatusHabilitacao,
  Tipologia,
  ValorFato,
} from '@/lib/schemas'
import { FASES_REGIME_LICENCIAMENTO } from '@/lib/vocabulario'
import type { EstadoFormulario } from '@/state/tipos'

// ---------------------------------------------------------------------------
// Procedências reutilizadas
// ---------------------------------------------------------------------------

const P_SIGMINE: Procedencia = {
  fonte: 'SIGMINE/ANM — processos minerários da Bahia',
  url: 'https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS/BA.zip',
  data_consulta: '2026-07-31',
}

const P_JOIN: Procedencia = {
  fonte: 'Interseção geométrica contra a malha municipal IBGE 2025 (A.3)',
  data_consulta: '2026-07-31',
}

const P_DESENHO: Procedencia = {
  fonte: 'Área desenhada pelo usuário; municípios derivados no cliente (A.9)',
  data_consulta: new Date().toISOString().slice(0, 10),
}

const P_FORM: Procedencia = {
  fonte: 'Declarado no formulário de caracterização (Escopo B)',
  data_consulta: new Date().toISOString().slice(0, 10),
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function fato(
  chave: string,
  valor: ValorFato,
  origem: Fato['origem'],
  procedencia?: Procedencia,
): Fato {
  return { chave, valor, origem, procedencia }
}

/** Junta os fatos num FactBase. O último a falar sobre uma chave vence. */
export function comporFactBase(...listas: Fato[][]): FactBase {
  const out: FactBase = {}
  for (const lista of listas) for (const f of lista) out[f.chave] = f
  return out
}

function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Habilitação de um município pelo nome.
 *
 * Ausente da base ⇒ `sem_evidencia`, nunca `nao_habilitado`. A diferença é o
 * produto inteiro: "não encontramos evidência" é honesto e gera pedido LAI;
 * "não é habilitado" seria uma afirmação normativa sem fonte.
 *
 * `municipios` é injetável (default = fixture do bundle) para o backend poder
 * passar a base real lida do SQLite (`backend/src/db.ts`) sem duplicar lógica.
 */
export function habilitacaoDe(
  nome: string,
  municipios: readonly MunicipioHabilitacao[] = MUNICIPIOS,
): MunicipioHabilitacao | null {
  const alvo = dobrar(nome)
  return municipios.find((m) => dobrar(m.nm_mun) === alvo) ?? null
}

export function statusDe(
  nome: string,
  municipios: readonly MunicipioHabilitacao[] = MUNICIPIOS,
): StatusHabilitacao {
  return habilitacaoDe(nome, municipios)?.status ?? 'sem_evidencia'
}

export function tipologiaPorId(
  id: string | null,
  tipologias: readonly Tipologia[] = TIPOLOGIAS,
): Tipologia | null {
  if (!id) return null
  return tipologias.find((t) => t.id === id) ?? null
}

// ---------------------------------------------------------------------------
// Fatos de cadastro — SIGMINE
// ---------------------------------------------------------------------------

function fatosDeProcesso(e: EstadoFormulario): Fato[] {
  const p = e.processo
  if (!p) return []
  return [
    fato('processo', p.processo, 'cadastro', P_SIGMINE),
    fato('titular', p.titular, 'cadastro', P_SIGMINE),
    fato('area_ha', p.area_ha, 'cadastro', P_SIGMINE),
    fato('municipios', p.municipios, 'derivado', P_JOIN),
    fato('cruza_divisa', p.cruza_divisa, 'derivado', P_JOIN),
  ]
}

function fatosDeArea(e: EstadoFormulario): Fato[] {
  const a = e.area
  if (!a) return []
  return [
    fato('area_ha', a.area_ha, 'derivado', P_DESENHO),
    fato('municipios', a.municipios.map((m) => m.nm_mun), 'derivado', P_DESENHO),
    fato('cruza_divisa', a.cruza_divisa, 'derivado', P_DESENHO),
  ]
}

// ---------------------------------------------------------------------------
// Fatos declarados — o formulário
// ---------------------------------------------------------------------------

function fatosDeclarados(e: EstadoFormulario, tipologias: readonly Tipologia[]): Fato[] {
  const out: Fato[] = []
  const tip = tipologiaPorId(e.tipologia_id, tipologias)

  if (e.substancia) {
    // Substância vem do SIGMINE; se o usuário sobrescreveu, deixa de ser
    // cadastro e passa a ser declaração — e a tela precisa mostrar isso (B.2).
    out.push(
      fato(
        'substancia',
        e.substancia,
        e.substancia_editada ? 'declarado' : 'cadastro',
        e.substancia_editada ? P_FORM : P_SIGMINE,
      ),
    )
  }

  if (e.fase) {
    out.push(
      fato(
        'fase',
        e.fase,
        e.fase_editada ? 'declarado' : 'cadastro',
        e.fase_editada ? P_FORM : P_SIGMINE,
      ),
    )
    // B.3 — o regime de licenciamento da Lei 6.567/1978 é gatilho de
    // competência local; a fase do SIGMINE é o que o denuncia.
    const regime = FASES_REGIME_LICENCIAMENTO.some((f) => dobrar(f) === dobrar(e.fase))
    out.push(fato('regime_licenciamento', regime, 'derivado', P_SIGMINE))
  }

  if (tip) {
    out.push(fato('tipologia_id', tip.id, 'declarado', P_FORM))
    out.push(fato('potencial_poluente', tip.potencial_poluente, 'cadastro', P_FORM))
  }

  if (e.porte_valor !== null) {
    out.push(fato('porte_valor', e.porte_valor, 'declarado', P_FORM))
    if (tip) {
      out.push(fato('porte_unidade', tip.unidade_porte, 'cadastro', P_FORM))
      const f = faixaDe(tip, e.porte_valor)
      if (f) out.push(fato('faixa_porte', f, 'derivado', P_FORM))
    }
  }

  const c = e.condicionais
  const ativos = tip?.campos_condicionais ?? []
  if (ativos.includes('supressao_vegetacao') && c.supressao_vegetacao !== null) {
    out.push(fato('supressao_vegetacao', c.supressao_vegetacao, 'declarado', P_FORM))
    if (c.supressao_vegetacao && c.supressao_ha !== null) {
      out.push(fato('supressao_ha', c.supressao_ha, 'declarado', P_FORM))
    }
  }
  if (ativos.includes('recurso_hidrico') && c.recurso_hidrico.length > 0) {
    out.push(fato('recurso_hidrico', c.recurso_hidrico, 'declarado', P_FORM))
  }
  if (ativos.includes('explosivos') && c.explosivos !== null) {
    out.push(fato('explosivos', c.explosivos, 'declarado', P_FORM))
  }

  return out
}

// ---------------------------------------------------------------------------
// Fatos de cadastro cruzado — a base de habilitação (C.2)
// ---------------------------------------------------------------------------

/**
 * `status_municipais_divergentes` é verdadeiro quando a poligonal cruza divisa
 * **e** os municípios atingidos não compartilham um mesmo status `habilitado`.
 * Três municípios todos `sem_evidencia` contam como divergentes: o que impede
 * de concluir não é a discordância entre eles, é a ausência de habilitação
 * uniforme sob a mesma poligonal.
 */
function fatosDeHabilitacao(
  e: EstadoFormulario,
  tipologias: readonly Tipologia[],
  municipios: readonly MunicipioHabilitacao[],
): Fato[] {
  const nomes: string[] =
    e.processo?.municipios ?? e.area?.municipios.map((m) => m.nm_mun) ?? []
  if (nomes.length === 0) return []

  const status = nomes.map((n) => statusDe(n, municipios))
  const principal = nomes[0] // já vem ordenado por proporção decrescente (A.3)
  const hab = habilitacaoDe(principal, municipios)
  const tip = tipologiaPorId(e.tipologia_id, tipologias)

  const semEvidencia = nomes.filter((_, i) => status[i] === 'sem_evidencia')
  const uniformeHabilitado =
    new Set(status).size === 1 && status[0] === 'habilitado'
  const cruza = nomes.length > 1

  const procedencia = hab?.procedencia ?? {
    fonte: 'Município fora da base de habilitação levantada (C.2)',
    data_consulta: P_FORM.data_consulta,
  }

  const out: Fato[] = [
    fato('municipio_principal', principal, 'derivado', P_JOIN),
    fato('n_municipios', nomes.length, 'derivado', P_JOIN),
    fato('municipio_status', status[0], 'cadastro', procedencia),
    fato('municipio_nivel', hab?.nivel ?? null, 'cadastro', procedencia),
    fato('municipios_sem_evidencia', semEvidencia, 'derivado', procedencia),
    fato(
      'status_municipais_divergentes',
      cruza && !uniformeHabilitado,
      'derivado',
      procedencia,
    ),
  ]

  if (tip) {
    // Competência abstrata não é habilitação concreta: o município pode estar
    // habilitado e ainda assim não ter ESTA tipologia entre as delegadas.
    const delegadaEmTodos = nomes.every((n) =>
      (habilitacaoDe(n, municipios)?.tipologias_delegadas ?? []).includes(tip.id),
    )
    out.push(
      fato('tipologia_delegada_ao_municipio', delegadaEmTodos, 'cadastro', procedencia),
    )
  }

  return out
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

/** Fontes de dado normativo, injetáveis para não depender do bundle. */
export interface FontesFactBase {
  tipologias?: readonly Tipologia[]
  municipios?: readonly MunicipioHabilitacao[]
}

/**
 * O FactBase completo do estado atual. É a única coisa que o motor recebe.
 *
 * Sem `fontes`, usa TIPOLOGIAS/MUNICIPIOS do bundle (frontend, SPA estático).
 * O backend passa a base real lida do SQLite (`backend/src/db.ts`).
 */
export function construirFactBase(e: EstadoFormulario, fontes: FontesFactBase = {}): FactBase {
  const tipologias = fontes.tipologias ?? TIPOLOGIAS
  const municipios = fontes.municipios ?? MUNICIPIOS
  return comporFactBase(
    fatosDeProcesso(e),
    fatosDeArea(e),
    fatosDeclarados(e, tipologias),
    fatosDeHabilitacao(e, tipologias, municipios),
  )
}

/** Rótulos legíveis, para o painel "por quê?" e para o pedido LAI (G.1). */
export const ROTULO_FATO: Record<string, string> = {
  processo: 'Processo ANM',
  titular: 'Titular',
  area_ha: 'Área da poligonal',
  municipios: 'Municípios atingidos',
  municipio_principal: 'Município de maior incidência',
  municipio_status: 'Habilitação do município para gestão ambiental compartilhada',
  municipio_nivel: 'Nível de habilitação',
  municipios_sem_evidencia: 'Municípios sem evidência pública de habilitação',
  status_municipais_divergentes: 'Habilitação não uniforme sob a mesma poligonal',
  tipologia_delegada_ao_municipio: 'Tipologia entre as delegadas ao município',
  cruza_divisa: 'Poligonal cruza divisa municipal',
  n_municipios: 'Número de municípios atingidos',
  substancia: 'Substância mineral',
  fase: 'Fase do processo na ANM',
  regime_licenciamento: 'Regime de licenciamento (Lei 6.567/1978)',
  tipologia_id: 'Tipologia licenciável',
  potencial_poluente: 'Potencial poluente/degradador',
  porte_valor: 'Parâmetro de porte declarado',
  porte_unidade: 'Unidade do parâmetro de porte',
  faixa_porte: 'Faixa de porte',
  supressao_vegetacao: 'Supressão de vegetação nativa',
  supressao_ha: 'Área de supressão',
  recurso_hidrico: 'Interferência em recurso hídrico',
  explosivos: 'Uso de explosivos',
}

export function rotuloFato(chave: string): string {
  return ROTULO_FATO[chave] ?? chave
}
