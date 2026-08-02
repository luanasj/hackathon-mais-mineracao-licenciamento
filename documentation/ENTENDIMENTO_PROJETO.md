# Entendimento macro do projeto — Motor de Enquadramento Licenciatório

> Documento de arquitetura e regras, escrito em 2026-08-01 a partir de leitura completa do código (motor, schemas, pipelines, UI) e dos dados reais em disco. Objetivo: dar visão de ponta a ponta do que existe, o que é real vs. placeholder, e o que falta — para decisão de prioridade nas horas finais antes do envio (02/08, 13h30).

---

## 1. O que o produto promete

Dada uma poligonal minerária na Bahia (ou um processo ANM buscado por número), o sistema responde:

- **Quem licencia** — União (IBAMA), Estado (INEMA) ou Município, ou `INDETERMINADO` quando falta fato.
- **Por qual trilha** — trifásico (LP→LI→LO), LU, LAC ou LAE.
- **Em que prazo legal**.
- **Com base em qual dispositivo normativo** (fundamento citável).
- Ou devolve `INDETERMINADO` e gera automaticamente um pedido de acesso à informação (LAI) para o fato que falta, em vez de chutar.

Regra de honestidade central do projeto (não é detalhe, é o argumento de venda): **nunca inventar dado**. Fundamento não conferido é marcado visualmente como pendente; fato ausente vira `INDETERMINADO`, nunca um chute.

---

## 2. Como o motor de regras decide (mecânica real, já implementada)

Fluxo: `state/formulario.tsx` → `construirFactBase()` (`lib/fatos.ts`) → `avaliar()` (`lib/motor.ts`) → `Parecer` (`lib/schemas.ts`). Reavaliado via `useMemo` a cada mudança de estado — sem debounce, sem cache, síncrono.

**Fatos (`FactBase`)** vêm de 3 procedências, sempre rastreadas: `cadastro` (veio do SIGMINE/ANM), `derivado` (calculado — interseção geométrica, faixa de porte, join com habilitação municipal), `declarado` (o usuário digitou). Cada fato carrega sua fonte, para o painel "por quê?" citar de onde veio cada afirmação.

**Precedência**: UNIAO=100 > ESTADUAL=60 > MUNICIPAL=30 > INDETERMINADA=0. Todas as regras são avaliadas (sem short-circuit); a de maior precedência que disparou vence; as demais que disparariam viram "fatores concorrentes" exibidos na tela, nunca descartados silenciosamente.

**7 predicados**: `igual, em, contem, maior, menor, entre, existe`. Não existe operador OR — expressa-se como regras separadas. Fato ausente sempre avalia `false` sem lançar erro; quem transforma ausência em `INDETERMINADO` é a lista `exige_fato` de cada regra.

**3 estados de saída**, nesta ordem de prioridade: `INDETERMINADO` (sem vencedora, ou vencedora indeterminada, ou fato faltando) → `CONDICIONAL` (vencedora tem `torna_condicional: true`, ex. poligonal cruzando divisa com status divergente) → `DEFINIDA`.

**Detecção de limiar (a "2ª virada")**: para cada fronteira de faixa de porte da tipologia, o motor reavalia logo abaixo e logo acima e registra onde a competência muda — é reavaliação em pontos discretos (as faixas da CEPRAM são função degrau), não busca binária contínua. Barato e exato, e produz de brinde os marcadores visuais do slider de porte.

**Rastro de execução**: cada conclusão na tela abre a cadeia completa de predicados avaliados, com fundamento por passo.

Essa mecânica (avaliador, precedência, limiar, rastro, 3 estados) está **implementada e é funcional** — é a parte mais madura do projeto. O código se autodeclara `STUB_D` (`motor.ts:2,41`) não porque a mecânica seja falsa, mas porque os **dados que ela consome** (regras, tipologias, municípios) são fixtures fictícias, e porque um bloco inteiro de funcionalidade (trilha/prazo/anuência) está deliberadamente vazio.

---

## 3. O que NÃO está implementado (vazio de propósito, não bug)

`Parecer.trilha_selecionada`, `opcoes`, `prazo_legal_total_dias`, `n_licencas`, `anuencias` são **sempre `null`/`[]`** (`motor.ts:314-335`). Os tipos `Trilha`, `EtapaTrilha`, `Anuencia` existem no schema congelado (`schemas.ts:260-288`) mas não têm nenhuma implementação, dado ou consumidor em lugar nenhum do repositório.

**Consequência direta para o pitch**: hoje o produto só responde "quem licencia" e "com que fundamento" — nunca "por qual trilha" nem "em quantos dias", apesar de ambos serem parte da promessa central e de o `Parecer` já ter os campos reservados.

Anuências acessórias (ASV, recurso hídrico, explosivos) já são **coletadas** no formulário e viram fatos no `FactBase`, mas **nenhuma regra os consome hoje** — são fatos órfãos.

---

## 4. Os dois pipelines de dado — a descoberta mais importante

Existem **dois pipelines completamente desconectados**, confirmado por grep (zero referências cruzadas):

```
PIPELINE 1 — geoespacial (Escopo A, conectado e funcional)
data_source/ (shapefiles SIGMINE + IBGE)
    → pipeline/prep.py + municipios.py + relevo.py
    → frontend/public/data/*.geojson, *.json  (2.585 processos, 10 municípios, 142 tiles)
    → consumido em runtime pelo frontend (fetch)

PIPELINE 2 — jurídico/institucional (Escopo C, dado real, MAS ISOLADO)
scraping (GAC, Querido Diário) → data/raw/*
    → scripts/build_dataset.py, build_cepram_divisao_b.py
    → data/processed/*.json  (417 municípios c/ habilitação real, 9 tipologias CEPRAM reais,
                               29 consórcios, 63 municípios c/ lei coletada)
    → scripts/generate_seed_sql.py
    → documentation/schema.sql + seed.sql → data/db/licenciamento.db (SQLite, via Docker)
    → NINGUÉM LÊ ISSO DE VOLTA. Fim de linha.

PIPELINE 3 — licenças concedidas (research_pipeline, LangGraph, dado real e pago)
Gemini Deep Research → raw_report.md (versionado em research_pipeline/tests/fixtures/)
    → DeepSeek extract + normalize → validate → rank_and_emit
    → research_pipeline/runs/<run_id>/licencas_<ano>.json  (gitignored)
    → data/processed/licencas/<run_id>.json  (versionado, um arquivo por rodada trimestral)
    → scripts/generate_seed_sql.py → tabelas pesquisa_run / licenca / pesquisa_aviso
    → mesmo destino do Pipeline 2: inspeção humana no sqlite-web, não lido pelo motor.
```

O motor de regras (`frontend/src/lib/motor.ts`) e os fatos (`frontend/src/data/fixtures.ts`) usam **exclusivamente** fixtures fictícias: **2 municípios, 2 tipologias, 4 regras**, todas com `fundamento.verificado: false` e comentário explícito "valor plausível, não normativo".

O trabalho jurídico do Escopo C **já está pronto, real e verificado** — só nunca foi plugado. O comentário no próprio `fixtures.ts` já previa isso: "C.1 troca `TIPOLOGIAS`, C.2 troca `MUNICIPIOS`, C.4 troca `REGRAS`" — essa troca nunca aconteceu. **Este é o gap mais crítico do projeto hoje, maior que qualquer bug de UI.**

O SQLite/Docker (`documentation/schema.sql`, `data/db/licenciamento.db`) é um espelho relacional dos JSONs para inspeção humana (rodar `sqlite-web` e navegar visualmente) — não é lido pelo motor nem pela interface. Não modela `Regra` nem `Parecer` (o próprio cabeçalho do `schema.sql` admite isso).

O `README.md` raiz descreve só o Pipeline 1 — não menciona `scripts/`, `data/raw/`, `data/processed/`, `documentation/schema.sql` ou `data/db/` em lugar nenhum. Isso indica dois membros do time trabalhando em ilhas que nunca se uniram, e a documentação reflete só metade do projeto.

---

## 5. Dado real disponível hoje (não usado) vs. dado em uso no motor

| Fonte | Conteúdo real em disco | Usado pelo motor hoje? |
|---|---|---|
| `data/processed/municipios_habilitados.json` | **417 municípios**, GAC real: 367 habilitado / 50 não-habilitado, níveis 1/2/3 | **Não** — motor usa 2 municípios hardcoded |
| `data/processed/consorcios.json` | 29 consórcios, 386 vínculos | Não |
| `data/processed/cepram_divisao_b_mineracao.json` | **9 tipologias reais** (Grupos B3 e B4), limiares reais, `verificado: true`, extraído do PDF oficial (a planilha `.xlsx` foi checada e descartada por divergir) | **Não** — motor usa 2 tipologias fictícias, com números inventados e citando a norma errada (4.420/2015 em vez da real 4.327/2013) |
| `data/processed/leis_por_municipio.json` | 63 municípios com evidência de ato no Diário Oficial, 2.008 atos brutos, 0% confirmado manualmente | Não usado por regra nenhuma |
| `frontend/src/data/fixtures.ts` | 2 tipologias, 2 municípios, 4 regras, tudo marcado como placeholder | **É isto que o motor de fato consome** |
| `frontend/public/data/indice_processos.json` / `processos.geojson` | **2.585 processos reais** do SIGMINE, 10 municípios da amostra | Sim, via busca de processo — mas só alimenta substância/fase/área/município, não competência |

**Achado concreto de qualidade de dado**: o mesmo código IBGE `2928406` aparece como "Santaluz" em `municipios10.geojson` (pipeline geoespacial) e como "Santa Rita de Cássia" em `municipios_habilitados.json` (pipeline jurídico). Não quebra nada hoje porque o join é feito por nome normalizado, não por código — mas vai quebrar silenciosamente (virando `sem_evidencia`) no dia em que alguém conectar os dois pipelines, se não for resolvido antes.

**Lacuna de fonte, não de execução**: os Grupos B1/B2 da CEPRAM (minerais metálicos — ouro, cobre, vanádio, níquel, ferro) estão **ausentes do PDF fonte usado**, documentado como tal (não é erro de extração). Isso é grave porque é exatamente o perfil mineral de 8 dos 10 municípios da amostra (Jacobina/ouro, Jaguarari/cobre, Maracás/vanádio, Itagibá/níquel, Caetité/urânio+ferro). Sem esse grupo, mesmo integrando C.1 ao motor, essas tipologias continuam sem fundamento real.

---

## 6. Estado por escopo — corrigido contra o README (que está desatualizado)

| Escopo | README diz | Realidade encontrada |
|---|---|---|
| 0 — Fundação | ✅ completo | Confirmado. |
| A — SIGMINE/poligonal | ✅ P0 completo | Confirmado e robusto: 2.585 processos reais, mapa offline com relevo real, busca com fallback de desenho, geodésico correto (`turf.circle` em km). |
| B — Formulário | ✅ P0 completo | Confirmado, mas o conteúdo que ele oferece (tipologias/faixas) é fixture, não dado real. |
| C — Base de regras | 🚧 "caminho crítico, trabalho documental" | **Desatualizado.** O dado já foi produzido e verificado (417 municípios, 9 tipologias, SQLite populado) — o que falta não é coleta, é **integração** (escrever o adaptador `data/processed/*.json` → `fixtures.ts`) mais **fundamentação jurídica das 4 regras de competência** (ainda `pendente`). |
| D — Motor de match | ⚠️ stub provisório | Mecânica real e sofisticada; roda sobre dado fictício. Trilhas/prazos/anuências inexistentes de propósito. |

| F — Interface | 🚧 tela provisória | **Subestimado.** A tela única (`ParecerCompetencia.tsx`) já é rica: 3 estados tratados, painel "por quê?", fatores concorrentes, "para quem ligar", exportação (via `window.print()`), botões de virada, mapa com 3 níveis de zoom. Falta polimento, não estrutura. |
| G — Integração LAI | 🚧 não iniciado | **Incorreto.** `lai.ts` já gera e baixa um pedido `.txt` real, citando Lei 12.527/2011 arts. 10/11 e prazos — é MVP funcional, não ausente. Falta: PDF real, campos do requerente pré-preenchidos. |
| H — Entregáveis | 🚧 licença/README em andamento | Confirmado: sem vídeo, sem deck no repo ainda. |

---

## 7. Risco concreto e específico para a demo (achado por leitura de código, não suposição)

As 4 "viradas" da demo não se comportam de forma uniforme ao clicar:

- **Virada urânio (Caetité → UNIÃO/IBAMA)**: funciona 100% num clique. A regra depende só de `substancia contém 'URÂNIO'`, que já vem preenchido pela seleção do processo.
- **Virada divisa (→ INDETERMINADO + LAI)**: funciona 100% num clique. Nenhum dos 3 municípios do processo está na fixture, então todos caem em `sem_evidencia`, produzindo divergência de status automaticamente.
- **Virada município habilitado (→ MUNICIPAL)** e **virada porte alto (→ ESTADUAL)**: **não funcionam só com o clique**. O clique no botão seta apenas processo/substância/fase/área — não seta `tipologia_id` nem `porte_valor`. Sem esses dois campos, a regra correspondente não dispara (faltam fatos) e a tela mostra `INDETERMINADO` em vez do resultado esperado. O apresentador precisa **também** selecionar a tipologia no dropdown e arrastar/digitar um porte válido — passo manual que não está documentado em lugar nenhum.

Isso é um risco real de a demo "quebrar" ao vivo se o roteiro de pitch não contemplar esse passo extra explicitamente.

---

## 8. Gaps priorizados

1. **Conectar o pipeline C ao motor** — escrever o adaptador que lê `data/processed/cepram_divisao_b_mineracao.json` e `municipios_habilitados.json` (ou o subconjunto dos 10 municípios da amostra) e produz `TIPOLOGIAS`/`MUNICIPIOS` reais para `fixtures.ts`, convertendo os campos textuais de porte (`"< 75.000"`) para a estrutura `FaixaTipologia[]` que `porte.ts` espera. Essa conversão não existe em código nenhum ainda.
2. **Fundamentar as regras de competência (C.4)** — hoje `pendente()` em todas as 4. Precisa de dispositivo real (LC 140/2011, Lei 6.567/1978, resolução de habilitação GAC) com `verificado: true`.
3. **Resolver a divergência de código IBGE 2928406** antes de plugar dado real de habilitação — ou o join por nome vai mascarar um erro de base.
4. **Corrigir/roteirizar as viradas 1 e 2** — ou fazer o clique também setar tipologia+porte default, ou documentar explicitamente o passo manual no roteiro do pitch.
5. **Decidir o mínimo viável de trilha/prazo (C.5)** — mesmo que seja só o suficiente para as 4 viradas terem uma trilha e um prazo exibível; hoje esse campo é sempre vazio e é parte central da promessa do produto.
6. **Atualizar o README** — documentar os dois pipelines, `scripts/`, `data/processed/`, `documentation/schema.sql`, `data/db/`. Hoje um jurado que leia o README não descobre que esse trabalho existe.
7. **Suprir Grupos B1/B2 da CEPRAM** (metálicos) se houver tempo/fonte — sem isso, tipologias de 8 dos 10 municípios da amostra continuam sem fundamento real mesmo após integrar C.1.
8. Menor prioridade dado o prazo: testes automatizados (D.8), gráficos (E), PDF real do parecer, PDF/e-SIC real do LAI (G), vídeo/deck/ensaios (H) — nenhum destes existe ainda.

---

## 9. Recomendação de próximos passos (dado o prazo — envio 02/08 13h30)

Ordem sugerida, do que mais destrava valor de demo por hora investida:

1. **Adaptador C→fixtures (item 1 acima)** — é o item que transforma "motor bonito rodando sobre dado inventado" em "motor rodando sobre dado real e verificado". Maior alavancagem única do projeto agora.
2. **Fundamento real nas 4 regras (item 2)** — sem isso, mesmo com dado real, a cadeia de fundamento ainda mostra "pendente" na tela, o que contradiz o argumento central de honestidade do produto.
3. **Roteirizar (não necessariamente corrigir em código) as viradas 1/2** — mais barato que mudar o reducer: só precisa documentar o passo extra no ensaio do pitch. Corrigir em código (auto-setar tipologia/porte no clique da virada) é mais seguro para a demo e é uma mudança pequena e localizada em `ParecerCompetencia.tsx`/`state/formulario.tsx`.
4. **Um mínimo de trilha/prazo hardcoded para os 4 cenários da demo** — não precisa ser genérico ainda, só precisa não deixar os campos vazios nas 4 viradas roteirizadas.
5. **Atualizar README** — 30 minutos, alto retorno para avaliação de "grau de completude" e "reprodutibilidade" pontuados pela banca.
6. Se sobrar tempo: B1/B2 CEPRAM, gráficos E.1-E.3, PDF real, vídeo/deck/ensaio (H.3-H.5, já classificados como ⚠️ DESTAQUE no backlog original — não esquecer, são apólice de seguro de entrega, independente do estado do código).

---

## 10. Apêndice — Regras de negócio explícitas do motor

- **Precedência fixa**: `UNIAO=100 > ESTADUAL=60 > MUNICIPAL=30 > INDETERMINADA=0`. Todas as regras avaliam (sem short-circuit); maior precedência que disparou vence; demais viram fatores concorrentes, nunca somem.
- **7 operadores de predicado**: `igual, em, contem, maior, menor, entre, existe`. Sem operador OR — disjunção vira duas regras separadas, de propósito, para o rastro mostrar cada caminho isolado. `contem` normaliza acento/caixa (`URÂNIO` casa com `MINÉRIO DE URÂNIO`). `entre` é `[min, max)`, mesma convenção das faixas de porte.
- **Fato ausente sempre avalia `false`**, sem lançar erro. Só o campo `exige_fato` de cada regra decide se a ausência vira `INDETERMINADO` — senão a regra simplesmente não dispara.
- **3 estados, nesta ordem de prioridade**: `INDETERMINADO` (sem vencedora, ou vencedora indeterminada, ou fato faltando) → `CONDICIONAL` (vencedora com `torna_condicional: true`) → `DEFINIDA`. Falta de fato vence tudo, de propósito.
- **`sem_evidencia` é estado válido do produto**, não falha de coleta: município fora da base nunca vira `nao_habilitado` (afirmação normativa sem fonte) — vira `sem_evidencia`, que aciona o pedido LAI.
- **`status_municipais_divergentes`**: verdadeiro quando a poligonal cruza divisa **e** os municípios não compartilham o mesmo status `habilitado`. Três municípios todos `sem_evidencia` conta como divergente também.
- **Lacuna só conta se for relevante à conclusão**: competência federal absorve tudo abaixo — não saber habilitação municipal num processo de urânio não gera `INDETERMINADO`, pois a precedência já resolveu.
- **Só se exibe prazo legal, nunca prazo observado** — misturar as duas coisas (médias reais de análise da ANM vs. prazo normativo de licenciamento ambiental) é erro material, não estilo.
- **O produto exibe o limiar de porte; não recomenda ficar abaixo dele** — evita orientar fracionamento irregular de área ou de declaração.
- **4 regras cadastradas hoje** (todas `fundamento.verificado: false`, fixture): `federal-substancia-nuclear` (substância contém URÂNIO → UNIÃO/IBAMA), `municipal-habilitado-tipologia-delegada` (habilitado + tipologia delegada + faixa micro/pequeno + não cruza divisa → MUNICIPAL), `estadual-porte-acima-da-faixa-delegada` (faixa medio/grande/excepcional + status não divergente → ESTADUAL/INEMA), `condicional-divisa-status-divergente` (cruza divisa + status divergente → INDETERMINADA, `torna_condicional: true`).

---

## 11. Apêndice — Estrutura de dados (os 4 schemas congelados)

Contrato em `frontend/src/lib/schemas.ts` — nenhum campo novo entra depois do congelamento.

```ts
// Transversal — toda afirmação normativa carrega isto
interface Fundamento {
  norma: string; dispositivo: string; transcricao?: string; url?: string
  verificado: boolean; data_conferencia?: string
}

// SCHEMA 1 — uma linha do anexo de mineração da CEPRAM
interface Tipologia {
  id: string; codigo: string | null; atividade: string; grupo: string
  parametro_porte: string; unidade_porte: string           // ex.: "produção bruta", "t/ano"
  faixas: { faixa: FaixaPorte; min: number; max: number | null }[]  // [min,max), max:null=topo
  potencial_poluente: 'pequeno' | 'medio' | 'grande'
  campos_condicionais: string[]                            // ex.: ['supressao_vegetacao','explosivos']
  fundamento: Fundamento
}

// SCHEMA 2 — dossiê de habilitação municipal para gestão ambiental compartilhada
interface MunicipioHabilitacao {
  cd_mun: string; nm_mun: string
  status: 'habilitado' | 'nao_habilitado' | 'sem_evidencia'
  nivel: string | null; tipologias_delegadas: string[]
  ato: string | null; vigencia_desde: string | null
  procedencia: Procedencia; observacao?: string
}

// SCHEMA 3 — regra de competência
interface Regra {
  id: string; descricao: string
  condicoes: Predicado[]                                   // AND implícito
  efeito: {
    instancia: Instancia; orgao: Orgao; precedencia?: number
    trilhas_elegiveis?: ModalidadeTrilha[]; anuencias?: string[]
    alertas?: Omit<Alerta,'origem_regra'>[]
  }
  torna_condicional?: boolean
  exige_fato?: string[]                                    // ausência força INDETERMINADO
  fundamento: Fundamento; prioridade?: 'P0'|'P1'|'P2'
}

// SCHEMA 4 — saída canônica do motor
interface Parecer {
  schema_versao: '1.0.0'; gerado_em: string
  estado: 'DEFINIDA'|'CONDICIONAL'|'INDETERMINADO'
  instancia: Instancia; orgao: Orgao; fatos: FactBase
  trilha_selecionada: Trilha | null                        // sempre null hoje
  opcoes: OpcaoComparada[]                                 // sempre [] hoje
  prazo_legal_total_dias: number | null                    // sempre null hoje
  n_licencas: number | null                                // sempre null hoje
  anuencias: Anuencia[]                                    // sempre [] hoje
  alertas: Alerta[]; fatores_concorrentes: FatorConcorrente[]
  rastro: PassoRastro[]; limiares: LimiarVirada[]
  fatos_faltantes: { chave: string; rotulo: string; destinatario_sugerido?: string }[]
  tem_fundamento_pendente: boolean
  pedido_lai_gerado?: { gerado_em: string; destinatario: string }
}

// Fronteira formulário ↔ motor
type OrigemFato = 'declarado' | 'derivado' | 'cadastro'
interface Fato { chave: string; valor: ValorFato; origem: OrigemFato; procedencia?: Procedencia }
type FactBase = Record<string, Fato>   // o motor lê exclusivamente daqui
```

**Amostra de 10 municípios** (única base de habilitação levantada): Jacobina, Jaguarari, Maracás, Campo Formoso, Pojuca, Caetité, Brumado, Itagibá, Andorinha, Santaluz. Fora da amostra → `INDETERMINADO` + pedido LAI, por desenho.

---

## 12. Apêndice — Fluxo passo a passo (runtime)

```
1. Usuário busca processo ANM por número OU desenha poligonal no mapa
2. Frontend intersecta poligonal × malha municipal IBGE → municipios[] + cruza_divisa
3. Usuário caracteriza no formulário: tipologia, substância, fase, porte, condicionais
4. construirFactBase() (lib/fatos.ts) funde 4 fontes num FactBase:
     fatosDeProcesso (cadastro) + fatosDeArea (derivado) +
     fatosDeclarados (declarado/derivado) + fatosDeHabilitacao (cadastro cruzado)
5. avaliar(factBase) (lib/motor.ts):
     avalia todas as regras → resolve por precedência → fatores concorrentes →
     levanta fatos_faltantes relevantes → decide estado (INDETERMINADO > CONDICIONAL > DEFINIDA) →
     varre fronteiras de porte (limiares) → monta rastro completo
6. Parecer é consumido sem adaptação por: interface, comparador (E, não implementado),
   gerador de pedido LAI (quando fatos_faltantes não-vazio)
7a. DEFINIDA/CONDICIONAL → tela mostra veredito + fundamento (trilha ainda sempre null)
7b. INDETERMINADO → botão gera pedido_lai (.txt), citando Lei 12.527/2011 arts. 10/11
```

Reavaliação via `useMemo` a cada mudança de estado — síncrono, sem debounce, sem cache.

**As 4 viradas da demo** (`frontend/src/data/viradas.ts`, embarcadas no bundle para sobreviver a falha de fetch):

| # | Cenário | Resultado esperado | Funciona só com 1 clique? |
|---|---|---|---|
| 1 | Granito em Brumado (871.855/2021) | `MUNICIPAL` — definida | Sim |
| 2 | Mesmo processo, porte cruza fronteira | `ESTADUAL` — INEMA | **Não** — precisa também setar tipologia + porte manualmente |
| 3 | Urânio em Caetité (871.787/2024) | `UNIÃO` — IBAMA | Sim |
| 4 | Ouro entre 3 municípios, 1 fora da amostra (871.108/2018) | `INDETERMINADO` → pedido LAI | Sim |
