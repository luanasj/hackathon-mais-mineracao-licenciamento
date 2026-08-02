/**
 * Motor de ranking de instâncias — "onde tenho mais chance de protocolar?".
 *
 * NÃO substitui `frontend/src/lib/motor.ts`. As duas engines respondem
 * perguntas diferentes e têm ordens de prioridade OPOSTAS, de propósito:
 *
 *   motor.ts   competência legal   UNIÃO(100) > ESTADO(60) > MUNICÍPIO(30)
 *   ranking.ts viabilidade prática MUNICÍPIO(1) > ESTADO(2) > FEDERAÇÃO(3)
 *
 * A inversão não é contradição: a primeira diz quem *pode* licenciar, a
 * segunda diz onde o protocolo *anda* — o município é preferido quando tem
 * competência delegada E corpo técnico, porque é a via mais curta. Por isso
 * esta engine consulta aquela como trava (passo 0): recomendar o município
 * num caso de competência federal absoluta seria orientar protocolo
 * juridicamente impossível.
 *
 * As transcrições da LC 140/2011 abaixo foram conferidas contra
 * `data_source/Lcp 140.pdf` (fonte primária versionada no repo) em 2026-08-02
 * e por isso saem com `verificado: true`. As mesmas normas aparecem em
 * `documentation/seed_regras.sql` com `fundamento_verificado = 0`, porque lá
 * ninguém as havia conferido — vale alinhar depois, não é divergência de fato.
 */
import { avaliar } from '@/lib/motor'
import { faixaDe } from '@/lib/porte'
import type { FactBase, Fundamento, MunicipioHabilitacao, Regra, Tipologia } from '@/lib/schemas'

import type { BuscadorAtos } from './busca-atos.ts'
import type { LicencaConcedida } from './db.ts'
import type {
  Confianca,
  EntradaRanking,
  EntradaResolvida,
  InstanciaRanqueada,
  LeiRelacionada,
  Motivo,
  RankingInstancias,
} from '@/lib/ranking-tipos'

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

/** Janela para licença emitida pelo próprio município (regra do usuário). */
export const JANELA_PROPRIA_MESES = 24

/** Janela para licença de município irmão de consórcio (regra do usuário). */
export const JANELA_CONSORCIO_MESES = 18

/**
 * Piso de cobertura para considerar a poligonal inteiramente baiana.
 *
 * `1 - 0.01`. O corte de lasca do pipeline é 0,5% da poligonal
 * (`pipeline/prep.py:73`), então um déficit abaixo de 1% é ruído de fronteira
 * entre duas malhas de origens diferentes, não saída do estado.
 */
export const LIMIAR_COBERTURA_BA = 0.99

/**
 * `potencial_poluente` do schema usa `grande`; a tabela `classe_impacto` usa
 * `alto` (grafia da própria resolução). Sem esta ponte o cruzamento do Art. 3º
 * não acha linha e toda tipologia de potencial alto cairia fora do grid.
 */
const POTENCIAL_PARA_CLASSE: Record<string, string> = {
  pequeno: 'pequeno',
  medio: 'medio',
  grande: 'alto',
}

// ---------------------------------------------------------------------------
// Fundamentos — transcrições literais de data_source/Lcp 140.pdf
// ---------------------------------------------------------------------------

const URL_LC140 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp140.htm'
const CONFERIDO_EM = '2026-08-02'

const LC140_FEDERAL_DOIS_ESTADOS: Fundamento = {
  norma: 'Lei Complementar 140/2011',
  dispositivo: 'Art. 7º, XIV, "e"',
  transcricao:
    'promover o licenciamento ambiental de empreendimentos e atividades: ' +
    'e) localizados ou desenvolvidos em 2 (dois) ou mais Estados',
  url: URL_LC140,
  verificado: true,
  data_conferencia: CONFERIDO_EM,
}

const LC140_FEDERAL_RADIOATIVO: Fundamento = {
  norma: 'Lei Complementar 140/2011',
  dispositivo: 'Art. 7º, XIV, "g"',
  transcricao:
    'destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor ' +
    'material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de ' +
    'suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)',
  url: URL_LC140,
  verificado: true,
  data_conferencia: CONFERIDO_EM,
}

const LC140_ESTADUAL: Fundamento = {
  norma: 'Lei Complementar 140/2011',
  dispositivo: 'Art. 8º, XIV',
  transcricao:
    'promover o licenciamento ambiental de atividades ou empreendimentos utilizadores de ' +
    'recursos ambientais, efetiva ou potencialmente poluidores ou capazes, sob qualquer forma, ' +
    'de causar degradação ambiental, ressalvado o disposto nos arts. 7º e 9º',
  url: URL_LC140,
  verificado: true,
  data_conferencia: CONFERIDO_EM,
}

const LC140_MUNICIPAL: Fundamento = {
  norma: 'Lei Complementar 140/2011',
  dispositivo: 'Art. 9º, XIV, "a"',
  transcricao:
    'promover o licenciamento ambiental das atividades ou empreendimentos: a) que causem ou ' +
    'possam causar impacto ambiental de âmbito local, conforme tipologia definida pelos ' +
    'respectivos Conselhos Estaduais de Meio Ambiente, considerados os critérios de porte, ' +
    'potencial poluidor e natureza da atividade',
  url: URL_LC140,
  verificado: true,
  data_conferencia: CONFERIDO_EM,
}

/**
 * Poligonal em dois municípios do mesmo estado. A LC 140 não tem dispositivo
 * expresso para o caso; o que existe é a leitura de que impacto repartido
 * entre dois municípios não é "de âmbito local" para nenhum deles, caindo na
 * competência remanescente do Art. 8º, XIV. É INTERPRETAÇÃO do produto —
 * `verificado: false`, mesma marcação que `condicional-divisa-status-divergente`
 * usa em `seed_regras.sql` para não passar critério interno por norma externa.
 */
const INTERPRETACAO_DOIS_MUNICIPIOS: Fundamento = {
  norma: 'Interpretação do produto sobre a LC 140/2011',
  dispositivo: 'Art. 9º, XIV, "a" a contrario sensu, c/c Art. 8º, XIV',
  transcricao:
    'Impacto repartido entre dois ou mais municípios não se enquadra como "de âmbito local" ' +
    'para nenhum deles isoladamente, remanescendo a competência estadual. Leitura do produto, ' +
    'não dispositivo expresso.',
  verificado: false,
}

// ---------------------------------------------------------------------------
// Utilidades puras
// ---------------------------------------------------------------------------

/**
 * Subtrai meses de uma data ISO. Overflow de fim de mês rola para o mês
 * seguinte (31/03 − 1 mês = 03/03), comportamento nativo de `Date.UTC`.
 * Aceitável para janela de 18/24 meses: erra no máximo 3 dias numa fronteira
 * de ~550 dias, e errar para o lado inclusivo não muda decisão nenhuma.
 */
export function subtrairMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1 - meses, dia)).toISOString().slice(0, 10)
}

/**
 * `"C1 e C3"` → `[1, 3]`. `"C3 E C5"` → `[3, 5]` (o `E` maiúsculo é como está
 * impresso no PDF em B4.2 e foi preservado de propósito na extração).
 * `null` → `[]`, que é dado: aquele nível não licencia aquela tipologia.
 */
export function classesAutorizadas(texto: string | null | undefined): number[] {
  if (!texto) return []
  return [...texto.matchAll(/C\s*(\d)/gi)].map((m) => Number(m[1]))
}

/** `"Classe 3"` → `3`. */
export function numeroDaClasse(classe: string): number {
  const m = classe.match(/(\d)/)
  return m ? Number(m[1]) : NaN
}

function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ---------------------------------------------------------------------------
// Bases injetáveis
// ---------------------------------------------------------------------------

export interface BasesRanking {
  tipologias: readonly Tipologia[]
  municipios: readonly MunicipioHabilitacao[]
  regras: readonly Regra[]
  /** `"{porte}|{potencial}"` -> `"Classe N"` */
  classeImpacto: ReadonlyMap<string, string>
  /** `"{tipologia_codigo}|{nivel}"` -> texto cru, ou `null` */
  niveisGestao: ReadonlyMap<string, string | null>
  licencas: readonly LicencaConcedida[]
  /**
   * Busca de atos do diário por relevância, executada por requisição contra o
   * índice FTS5 (`busca-atos.ts`). Injetada como função — e não como Map pronto —
   * para o motor continuar puro: os testes passam um buscador falso, a produção
   * passa o que fala com o SQLite.
   */
  buscarAtos: BuscadorAtos
  /** `consorcio_id` -> códigos IBGE membros */
  membrosConsorcio: ReadonlyMap<string, string[]>
  /** `codigo_ibge` -> `consorcio_id` */
  consorcioPorMunicipio: ReadonlyMap<string, string>
  /** Telefones institucionais (`frontend/src/parecer/dados.ts`). */
  telefones: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Passo 0 — trava de competência federal
// ---------------------------------------------------------------------------

/**
 * Reusa o motor de competência em vez de reimplementar a lista de substâncias
 * radioativas. O FactBase é montado só com `substancia`: nenhuma regra
 * municipal ou estadual consegue disparar sem `faixa_porte`/`municipio_status`,
 * então o que sobra é exatamente "existe regra que torna isto federal
 * independentemente de qualquer outro fato?".
 *
 * Consequência desejada: regra federal nova inserida em `regra`/`regra_condicao`
 * passa a travar este motor sem uma linha de código aqui.
 */
export function travaFederal(
  substancia: string | undefined,
  bases: Pick<BasesRanking, 'regras' | 'tipologias'>,
): Regra | null {
  if (!substancia) return null
  const fatos: FactBase = {
    substancia: { chave: 'substancia', valor: substancia, origem: 'cadastro' },
  }
  const parecer = avaliar(fatos, { regras: bases.regras, tipologias: bases.tipologias })
  if (parecer.instancia !== 'UNIAO') return null

  const dispararam = new Set(parecer.rastro.filter((p) => p.disparou).map((p) => p.regra_id))
  return bases.regras.find((r) => dispararam.has(r.id) && r.efeito.instancia === 'UNIAO') ?? null
}

// ---------------------------------------------------------------------------
// Montagem das instâncias
// ---------------------------------------------------------------------------

function leisFederais(radioativo: boolean, doisEstados: boolean): LeiRelacionada[] {
  const out: LeiRelacionada[] = []
  if (radioativo) out.push({ ...LC140_FEDERAL_RADIOATIVO, tipo: 'norma' })
  if (doisEstados) out.push({ ...LC140_FEDERAL_DOIS_ESTADOS, tipo: 'norma' })
  if (out.length === 0) out.push({ ...LC140_FEDERAL_DOIS_ESTADOS, tipo: 'norma' })
  return out
}

function leisEstaduais(tipologia: Tipologia | null): LeiRelacionada[] {
  const out: LeiRelacionada[] = [{ ...LC140_ESTADUAL, tipo: 'norma' }]
  if (tipologia) out.push({ ...tipologia.fundamento, tipo: 'norma' })
  return out
}

function leisMunicipais(
  tipologia: Tipologia | null,
  atosDoMunicipio: readonly LeiRelacionada[],
): LeiRelacionada[] {
  const out: LeiRelacionada[] = [{ ...LC140_MUNICIPAL, tipo: 'norma' }]
  if (tipologia) out.push({ ...tipologia.fundamento, tipo: 'norma' })
  return [...out, ...atosDoMunicipio]
}

function contatoFederal(telefones: Readonly<Record<string, string>>) {
  return {
    orgao: 'IBAMA — Superintendência na Bahia',
    telefone: telefones['IBAMA — Superintendência na Bahia'] ?? null,
    email: null,
    verificado: false,
    motivo: 'e-mail não levantado; telefone institucional sem conferência registrada',
    acao_sugerida: 'gerar_pedido_lai' as const,
  }
}

function contatoEstadual(telefones: Readonly<Record<string, string>>) {
  return {
    orgao: 'INEMA — Licenciamento',
    telefone: telefones['INEMA — Licenciamento'] ?? null,
    email: null,
    verificado: false,
    motivo: 'e-mail não levantado; telefone institucional sem conferência registrada',
    acao_sugerida: 'gerar_pedido_lai' as const,
  }
}

/**
 * O município é o único dos três sem nenhum contato levantado — e é justamente
 * a instância que este motor tende a colocar em 1º. `null` + motivo, nunca
 * placeholder: `scripts/collect_contatos.py` só gera esqueleto vazio e nunca
 * foi executado.
 */
function contatoMunicipal(nome: string) {
  return {
    orgao: `Órgão ambiental municipal de ${nome}`,
    telefone: null,
    email: null,
    verificado: false,
    motivo: 'contato municipal não levantado (data/raw/contatos/ não existe)',
    acao_sugerida: 'gerar_pedido_lai' as const,
  }
}

// ---------------------------------------------------------------------------
// A engine
// ---------------------------------------------------------------------------

export function ranquear(entrada: EntradaRanking, bases: BasesRanking): RankingInstancias {
  const data_referencia = entrada.data_referencia ?? new Date().toISOString().slice(0, 10)
  const avisos: string[] = []

  const tipologia =
    bases.tipologias.find((t) => t.codigo === entrada.tipologia_codigo) ?? null
  if (!tipologia) {
    avisos.push(
      `tipologia_desconhecida: '${entrada.tipologia_codigo}' não está na base. ` +
        'Os grupos B1 (metálicos) e B2 (gemas) da CEPRAM estão ausentes do PDF fonte — ' +
        'ouro, cobre, níquel, ferro e vanádio não têm tipologia cadastrada.',
    )
  }

  const cobertura_ba = entrada.municipios.reduce((s, m) => s + m.proporcao, 0)
  const faixa = tipologia ? faixaDe(tipologia, entrada.producao) : null
  const potencial = tipologia ? tipologia.potencial_poluente : null
  const classe =
    faixa && potencial
      ? bases.classeImpacto.get(`${faixa}|${POTENCIAL_PARA_CLASSE[potencial] ?? potencial}`) ?? null
      : null

  const resolvida: EntradaResolvida = {
    processo: entrada.processo,
    municipios: entrada.municipios,
    cobertura_ba: Number(cobertura_ba.toFixed(4)),
    tipologia_codigo: entrada.tipologia_codigo,
    tipologia_nome: tipologia?.atividade ?? 'desconhecida',
    producao: entrada.producao,
    unidade_porte: tipologia?.unidade_porte ?? '—',
    faixa_porte: faixa ?? 'indeterminada',
    potencial_poluidor: potencial ?? 'indeterminado',
    classe: classe ?? 'indeterminada',
    data_referencia,
  }

  const municipioPrincipal = entrada.municipios[0] ?? null
  const nomeMunicipio = municipioPrincipal?.nm_mun ?? 'município não identificado'

  // Busca por requisição, casando o texto do ato contra o vocabulário de
  // licenciamento e a substância desta tipologia. Só faz sentido quando há um
  // município único — nos ramos de desclassificação a evidência local não muda
  // nada, e consultar à toa custaria uma varredura FTS por chamada.
  const atosDoMunicipio =
    municipioPrincipal && entrada.municipios.length === 1
      ? bases.buscarAtos(municipioPrincipal.cd_mun, {
          nomeTipologia: tipologia?.atividade ?? null,
          substancia: entrada.substancia ?? null,
        })
      : []

  // -- montadores das três instâncias, com motivos acumuláveis ---------------

  const federal = (motivos: Motivo[], posicao: number | null, conf: Confianca): InstanciaRanqueada => ({
    instancia: 'FEDERAL',
    orgao: 'IBAMA',
    posicao,
    status: posicao === null ? 'desclassificado' : 'ranqueado',
    confianca: conf,
    motivos,
    leis: leisFederais(
      motivos.some((m) => m.codigo === 'competencia_federal_absoluta'),
      motivos.some((m) => m.codigo === 'poligonal_em_dois_estados'),
    ),
    contatos: contatoFederal(bases.telefones),
  })

  const estadual = (motivos: Motivo[], posicao: number | null, conf: Confianca): InstanciaRanqueada => ({
    instancia: 'ESTADUAL',
    orgao: 'INEMA',
    posicao,
    status: posicao === null ? 'desclassificado' : 'ranqueado',
    confianca: conf,
    motivos,
    leis: leisEstaduais(tipologia),
    contatos: contatoEstadual(bases.telefones),
  })

  const municipal = (motivos: Motivo[], posicao: number | null, conf: Confianca): InstanciaRanqueada => ({
    instancia: 'MUNICIPAL',
    orgao: `Órgão ambiental municipal de ${nomeMunicipio}`,
    posicao,
    status: posicao === null ? 'desclassificado' : 'ranqueado',
    confianca: conf,
    motivos,
    leis: leisMunicipais(tipologia, atosDoMunicipio),
    contatos: contatoMunicipal(nomeMunicipio),
  })

  const montar = (
    ranking: InstanciaRanqueada[],
    desclassificados: InstanciaRanqueada[],
  ): RankingInstancias => ({
    schema_versao: '1.0.0',
    gerado_em: new Date().toISOString(),
    entrada: resolvida,
    ranking: [...ranking].sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)),
    desclassificados,
    avisos,
  })

  // -- passo 0: trava de competência federal --------------------------------

  const regraFederal = travaFederal(entrada.substancia, bases)
  if (regraFederal) {
    const motivo: Motivo = {
      codigo: 'competencia_federal_absoluta',
      texto:
        `Substância "${entrada.substancia}" atrai competência federal por si só ` +
        `(regra ${regraFederal.id}), qualquer que seja o porte ou o município.`,
      fundamento: LC140_FEDERAL_RADIOATIVO,
    }
    return montar(
      [federal([motivo], 1, 'alta')],
      [
        estadual(
          [{ codigo: 'competencia_federal_absoluta', texto: 'Absorvida pela competência federal.' }],
          null,
          'alta',
        ),
        municipal(
          [{ codigo: 'competencia_federal_absoluta', texto: 'Absorvida pela competência federal.' }],
          null,
          'alta',
        ),
      ],
    )
  }

  // -- passo 1: poligonal em dois ou mais estados ---------------------------

  if (entrada.municipios.length > 0 && cobertura_ba < LIMIAR_COBERTURA_BA) {
    const faltante = ((1 - cobertura_ba) * 100).toFixed(1)
    avisos.push(
      `cobertura_ba_incompleta: ${faltante}% da poligonal está fora da malha municipal da ` +
        'Bahia. O sinal é geométrico e não nomeia o outro estado; poligonal costeira ou sobre ' +
        'grande lâmina d\'água produziria o mesmo déficit.',
    )
    const motivo: Motivo = {
      codigo: 'poligonal_em_dois_estados',
      texto:
        `Apenas ${(cobertura_ba * 100).toFixed(1)}% da poligonal está em municípios baianos; ` +
        `${faltante}% está fora da Bahia.`,
      fundamento: LC140_FEDERAL_DOIS_ESTADOS,
    }
    return montar(
      [federal([motivo], 1, 'media')],
      [
        estadual(
          [{ codigo: 'poligonal_em_dois_estados', texto: 'Poligonal excede o território estadual.' }],
          null,
          'media',
        ),
        municipal(
          [{ codigo: 'poligonal_em_dois_estados', texto: 'Poligonal excede o território estadual.' }],
          null,
          'media',
        ),
      ],
    )
  }

  // -- passo 2: poligonal em dois ou mais municípios ------------------------

  if (entrada.municipios.length > 1) {
    const nomes = entrada.municipios.map((m) => m.nm_mun).join(', ')
    return montar(
      [
        estadual(
          [
            {
              codigo: 'poligonal_em_dois_municipios',
              texto: `Poligonal repartida entre ${entrada.municipios.length} municípios (${nomes}).`,
              fundamento: INTERPRETACAO_DOIS_MUNICIPIOS,
            },
            {
              codigo: 'competencia_remanescente_do_estado',
              texto: 'Competência remanescente do Estado.',
              fundamento: LC140_ESTADUAL,
            },
          ],
          1,
          'alta',
        ),
        federal(
          [
            {
              codigo: 'competencia_supletiva_federal',
              texto: 'Instância superior, disponível mas não indicada como primeira via.',
            },
          ],
          2,
          'media',
        ),
      ],
      [
        municipal(
          [
            {
              codigo: 'poligonal_em_dois_municipios',
              texto:
                `Poligonal atinge ${entrada.municipios.length} municípios (${nomes}); ` +
                'não há licenciamento municipal para área repartida entre entes.',
              fundamento: INTERPRETACAO_DOIS_MUNICIPIOS,
            },
          ],
          null,
          'alta',
        ),
      ],
    )
  }

  // -- passo 3a: porta CEPRAM/GAC -------------------------------------------

  const habilitacao = municipioPrincipal
    ? bases.municipios.find((m) => dobrar(m.nm_mun) === dobrar(municipioPrincipal.nm_mun)) ?? null
    : null

  const nivel = habilitacao?.nivel ?? null
  const textoAutorizado = tipologia
    ? bases.niveisGestao.get(`${entrada.tipologia_codigo}|${nivel}`) ?? null
    : null
  const autorizadas = classesAutorizadas(textoAutorizado)
  const numeroClasse = classe ? numeroDaClasse(classe) : NaN

  const reprovacao = ((): Motivo | null => {
    if (!municipioPrincipal) {
      return {
        codigo: 'municipio_nao_habilitado',
        texto: 'Nenhum município identificado para a poligonal.',
      }
    }
    if (!habilitacao || habilitacao.status !== 'habilitado') {
      return {
        codigo: 'municipio_nao_habilitado',
        texto:
          `${nomeMunicipio} não consta como habilitado para gestão ambiental compartilhada ` +
          `(status: ${habilitacao?.status ?? 'sem_evidencia'}).`,
        fundamento: LC140_MUNICIPAL,
      }
    }
    if (!nivel) {
      return {
        codigo: 'municipio_sem_nivel',
        texto: `${nomeMunicipio} está habilitado, mas sem nível de gestão publicado.`,
        fundamento: LC140_MUNICIPAL,
      }
    }
    if (autorizadas.length === 0) {
      return {
        codigo: 'tipologia_nao_delegada_ao_nivel',
        texto:
          `O nível ${nivel} de ${nomeMunicipio} não licencia a tipologia ` +
          `${entrada.tipologia_codigo} em nenhuma classe.`,
        fundamento: tipologia?.fundamento,
      }
    }
    if (!Number.isFinite(numeroClasse) || !autorizadas.includes(numeroClasse)) {
      return {
        codigo: 'classe_acima_do_nivel',
        texto:
          `${entrada.producao.toLocaleString('pt-BR')} ${resolvida.unidade_porte} → porte ` +
          `${resolvida.faixa_porte}, potencial ${resolvida.potencial_poluidor} → ` +
          `${resolvida.classe}. O nível ${nivel} de ${nomeMunicipio} só licencia ` +
          `${textoAutorizado} nesta tipologia.`,
        fundamento: tipologia?.fundamento,
      }
    }
    return null
  })()

  if (tipologia) {
    avisos.push(
      'nivel_classe_nao_conferido: o mapa nível de gestão → classes autorizadas é ' +
        'interpretação do script de extração sobre os Arts. 2º/7º da CEPRAM 4.327/2013 ' +
        '(`verificado: false` na fonte). É a porta que desclassifica o município — é o ' +
        'elo mais frágil deste resultado.',
    )
  }

  if (atosDoMunicipio.length > 0) {
    avisos.push(
      'atos_sao_excertos_nao_leis: a evidência documental são janelas de ~505 caracteres ' +
        'recortadas em torno de um acerto de palavra dentro de uma edição diária inteira — ' +
        'o texto completo do diário nunca foi baixado. Além disso, 2.346 registros foram ' +
        'coletados de 35.224 acertos (teto de 10 por termo de busca), nenhum ato foi ' +
        'conferido à mão, e o corpus vai de 2004 a 2026 sem controle de revogação.',
    )
  }

  if (reprovacao) {
    return montar(
      [
        estadual(
          [
            {
              codigo: 'competencia_remanescente_do_estado',
              texto: 'Competência remanescente do Estado quando não há delegação municipal efetiva.',
              fundamento: LC140_ESTADUAL,
            },
          ],
          1,
          'alta',
        ),
        federal(
          [
            {
              codigo: 'competencia_supletiva_federal',
              texto: 'Instância superior, disponível mas não indicada como primeira via.',
            },
          ],
          2,
          'media',
        ),
      ],
      [municipal([reprovacao], null, 'alta')],
    )
  }

  // -- passo 3b: capacidade técnica ------------------------------------------

  const cd = municipioPrincipal!.cd_mun
  const limiteProprio = subtrairMeses(data_referencia, JANELA_PROPRIA_MESES)
  const limiteConsorcio = subtrairMeses(data_referencia, JANELA_CONSORCIO_MESES)

  const propria = bases.licencas.filter(
    (l) => l.codigo_ibge === cd && l.data_concessao! >= limiteProprio,
  )

  const consorcioId = bases.consorcioPorMunicipio.get(cd) ?? null
  const membros = consorcioId ? bases.membrosConsorcio.get(consorcioId) ?? [] : []
  const viaConsorcio = consorcioId
    ? bases.licencas.filter(
        (l) =>
          l.codigo_ibge !== cd &&
          membros.includes(l.codigo_ibge!) &&
          l.data_concessao! >= limiteConsorcio,
      )
    : []

  const motivosMunicipio: Motivo[] = [
    {
      codigo: 'competencia_delegada_confirmada',
      texto:
        `${nomeMunicipio} é habilitado nível ${nivel} e o nível autoriza ${textoAutorizado} ` +
        `na tipologia ${entrada.tipologia_codigo}; o empreendimento é ${resolvida.classe}.`,
      fundamento: LC140_MUNICIPAL,
    },
  ]

  if (propria.length > 0) {
    const ultima = propria[0]
    motivosMunicipio.push({
      codigo: 'licenciou_por_conta_propria',
      texto:
        `${nomeMunicipio} concedeu ${propria.length} licença(s) por estrutura própria nos ` +
        `últimos ${JANELA_PROPRIA_MESES} meses; a mais recente em ${ultima.data_concessao}` +
        `${ultima.numero_licenca ? ` (${ultima.numero_licenca})` : ''}.`,
    })
  }

  if (viaConsorcio.length > 0) {
    const origens = [...new Set(viaConsorcio.map((l) => l.municipio_nome))].join(', ')
    motivosMunicipio.push({
      codigo: 'consorcio_com_licenciamento_recente',
      texto:
        `${nomeMunicipio} integra consórcio com licenciamento nos últimos ` +
        `${JANELA_CONSORCIO_MESES} meses, por ${origens}.`,
    })
    avisos.push(
      'consorcio_inferido_de_licenca_municipal: nenhuma das licenças da base foi emitida POR ' +
        'consórcio (`licenciado_por` é `municipio_proprio` em 18 de 19). A capacidade do ' +
        'consórcio está sendo inferida de licença que o município irmão emitiu sozinho — ' +
        'inferência mais fraca que a evidência textual exigida em schema.sql:209.',
    )
  }

  const temAtos = atosDoMunicipio.length > 0
  const atoForte = atosDoMunicipio.find((a) => a.relevancia === 'alta')
  motivosMunicipio.push(
    temAtos
      ? {
          codigo: 'atos_locais_encontrados',
          texto: atoForte
            ? `${atosDoMunicipio.length} ato(s) em diário oficial de ${nomeMunicipio} casando ` +
              `vocabulário de licenciamento E a substância desta tipologia ` +
              `(${(atoForte.termos_consultados ?? []).slice(0, 6).join(', ')}); ` +
              `o mais relevante é de ${atoForte.data ?? 'data não informada'}. ` +
              'Nenhum conferido à mão.'
            : `${atosDoMunicipio.length} ato(s) em diário oficial de ${nomeMunicipio} casando ` +
              'vocabulário de licenciamento ambiental, mas sem menção à substância desta ' +
              'tipologia. Nenhum conferido à mão.',
        }
      : {
          codigo: 'sem_atos_locais_encontrados',
          texto:
            'Nenhum ato local com vocabulário de licenciamento encontrado na base documental — ' +
            'que cobre 63 dos 417 municípios, e apenas os 10 primeiros resultados por termo. ' +
            'Ausência de ato aqui é ausência de coleta, não ausência de lei.',
        },
  )

  const temCapacidade = propria.length > 0 || viaConsorcio.length > 0

  if (!temCapacidade) {
    motivosMunicipio.push({
      codigo: 'sem_evidencia_de_licenciamento',
      texto:
        `Sem evidência de licenciamento na base (19 licenças conhecidas, 14 de 417 municípios) ` +
        `para ${nomeMunicipio} nos últimos ${JANELA_PROPRIA_MESES} meses, nem para o consórcio ` +
        `nos últimos ${JANELA_CONSORCIO_MESES} meses.`,
    })
    avisos.push(...avisosDeCobertura(bases, limiteProprio))
    return montar(
      [
        estadual(
          [
            {
              codigo: 'competencia_remanescente_do_estado',
              texto: 'Via com corpo técnico permanente, na ausência de evidência municipal.',
              fundamento: LC140_ESTADUAL,
            },
          ],
          1,
          'alta',
        ),
        municipal(motivosMunicipio, 2, 'baixa'),
        federal(
          [
            {
              codigo: 'competencia_supletiva_federal',
              texto: 'Instância superior, disponível mas não indicada como primeira via.',
            },
          ],
          3,
          'media',
        ),
      ],
      [],
    )
  }

  avisos.push(...avisosDeCobertura(bases, limiteProprio))
  return montar(
    [
      // `alta` exige capacidade técnica E ato local que fale de licenciamento
      // DAQUELA substância. Ato genérico de licenciamento sustenta `media` — é
      // evidência de que o município licencia algo, não de que licencia isto.
      municipal(motivosMunicipio, 1, atoForte ? 'alta' : 'media'),
      estadual(
        [
          {
            codigo: 'competencia_remanescente_do_estado',
            texto: 'Competência remanescente do Estado, disponível como alternativa.',
            fundamento: LC140_ESTADUAL,
          },
        ],
        2,
        'alta',
      ),
      federal(
        [
          {
            codigo: 'competencia_supletiva_federal',
            texto: 'Instância superior, disponível mas não indicada como primeira via.',
          },
        ],
        3,
        'media',
      ),
    ],
    [],
  )
}

/**
 * A base de licenças não alcança o início da janela — então "não licenciou nos
 * últimos 24 meses" é, em parte, "não temos dado tão antigo". Sai como aviso
 * porque muda como o 2º lugar do município deve ser lido.
 */
function avisosDeCobertura(bases: BasesRanking, limiteProprio: string): string[] {
  const datas = bases.licencas.map((l) => l.data_concessao!).filter(Boolean).sort()
  if (datas.length === 0) return ['base_de_licencas_vazia: nenhuma licença com data na base.']
  const maisAntiga = datas[0]
  if (maisAntiga > limiteProprio) {
    return [
      `janela_maior_que_a_base: a janela começa em ${limiteProprio}, mas a licença mais antiga ` +
        `da base é de ${maisAntiga}. Parte da janela não tem cobertura — rode ` +
        '`python -m research_pipeline.run --ano 2024` para estendê-la.',
    ]
  }
  return []
}
