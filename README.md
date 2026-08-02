https://drive.google.com/file/d/1MYH6XfVu5xNjuZIPSRSqJ3gb0RFKCA9x/view?usp=sharing


# Motor de enquadramento licenciatório

**Hackathon+ Mineração 2026 · Escopo A — Licenciamento**

Dada uma poligonal minerária na Bahia, o sistema responde **quem licencia**
(União, Estado ou Município), **com base em qual dispositivo** e **onde o
protocolo tem mais chance de andar** — ou declara `INDETERMINADO` e gera o
pedido de acesso à informação que falta, em vez de chutar.

Regra de honestidade central: **nunca inventar dado**. Fato ausente vira
`INDETERMINADO`; fundamento não conferido contra a fonte primária aparece
marcado como pendente na interface.

---

## As duas perguntas, e os dois motores

O produto responde duas perguntas distintas, com **ordens de prioridade
opostas** — e isso é deliberado, não contradição:

| | Pergunta | Ordem | Onde roda |
| --- | --- | --- | --- |
| `frontend/src/lib/motor.ts` | Quem **pode** licenciar (competência legal) | UNIÃO 100 > ESTADO 60 > MUNICÍPIO 30 | no browser, offline |
| `backend/src/ranking.ts` | Onde o protocolo **anda** (viabilidade) | MUNICÍPIO 1 > ESTADO 2 > FEDERAÇÃO 3 | no servidor, exige SQLite |

O ranking consulta a competência como trava (passo 0): recomendar o município
num caso de competência federal absoluta seria orientar protocolo
juridicamente impossível.

**Sem backend no ar, a tela de competência continua funcionando** — só o
painel de ranking fica indisponível, com o motivo à vista. Nenhuma chamada de
rede pode derrubar o parecer.

### Como o motor de competência decide

```
formulário → construirFactBase() → avaliar() → Parecer
```

- **Fatos** carregam procedência sempre: `cadastro` (veio do SIGMINE/ANM),
  `derivado` (interseção geométrica, faixa de porte, join com habilitação) ou
  `declarado` (o usuário digitou).
- **7 predicados**: `igual, em, contem, maior, menor, entre, existe`. Não há
  operador OR — expressa-se como regras separadas.
- **Todas as regras são avaliadas** (sem short-circuit). A de maior
  precedência vence; as demais que disparariam viram *fatores concorrentes*
  exibidos na tela, nunca descartados em silêncio.
- **Três estados de saída**, nesta ordem: `INDETERMINADO` → `CONDICIONAL` →
  `DEFINIDA`.
- **Detecção de limiar (a "virada")**: para cada fronteira de faixa de porte,
  o motor reavalia logo abaixo e logo acima e registra onde a competência
  muda. As faixas da CEPRAM são função degrau, então reavaliação em pontos
  discretos é exata — e produz de brinde os marcadores do slider de porte.
- **Rastro de execução**: cada conclusão abre a cadeia completa de predicados
  avaliados, com fundamento por passo.

---

## Como rodar

### Contêiner único (o caminho do deploy)

O `Dockerfile` da raiz assa frontend, backend e banco numa imagem só. O
Express serve `/api/*` e o bundle do Vite na **mesma origem** — é isso que
dispensa CORS e uma `VITE_API_URL` no build.

```bash
docker build -t licenciamento .
docker run -p 8080:8080 licenciamento     # http://localhost:8080
```

O banco entra assado no estágio `db`, derivado 100% dos quatro `.sql` de
`documentation/`, e é aberto com `readOnly: true`. Nada de Cloud SQL, volume
ou disco persistente.

### Desenvolvimento local

O backend lê `data/db/licenciamento.db`, que é gitignored — construa primeiro:

```bash
sh scripts/build_local_db.sh          # schema + seed + seed_regras + FTS5
```

```bash
cd backend && npm install && npm run dev     # http://localhost:3001
```

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

O Vite faz proxy de `/api` para a 3001 (`frontend/vite.config.ts`), então o
browser vê tudo na mesma origem em desenvolvimento também.

### Navegar o banco

```bash
docker compose up --build            # sqlite-web em http://localhost:8080
```

Usa volume nomeado, não bind-mount: escrita direta do SQLite via bind-mount no
Docker Desktop dá `disk I/O error` no meio de transações grandes. Para levar o
`.db` para o host, use `docker cp` — ou o `build_local_db.sh` acima.

> `docker/entrypoint.sh` **reusa** o banco existente no volume. Depois de
> regerar o seed, `docker compose down -v` antes de subir — sem apagar o
> volume, a rodada nova não aparece e nada avisa.

### Testes

```bash
python -m pytest              # 333 testes — research_pipeline/ e common/
cd backend && npm test        #  55 testes — ranking e busca de atos
cd backend && npm run typecheck
```

Ambas as suítes passam offline, sem nenhuma chave de API.

---

## API

Servida por `backend/src/server.ts`. O backend **não reimplementa o motor**:
importa `avaliar`/`construirFactBase` do frontend via alias `@/*`, então o
`Parecer` que sai daqui é byte-a-byte comparável ao que a interface produz
sozinha.

| Rota | O que faz |
| --- | --- |
| `GET /api/tipologias` · `/api/tipologias/:id` | as 9 tipologias da Divisão B (mineração) |
| `GET /api/municipios?nome=` · `/api/municipios/:cd_mun` | os 417 municípios, com habilitação GAC |
| `POST /api/parecer` | `EstadoFormulario` → `Parecer` (competência legal) |
| `POST /api/ranking` | poligonal + tipologia + produção → ranking de instâncias |

`POST /api/ranking` aceita `{ processo }` (resolve a incidência municipal pelo
índice de poligonais) **ou** `{ municipios: [{cd_mun, nm_mun, proporcao}] }` —
o segundo é o caminho da poligonal desenhada à mão, que não tem número de
processo, e vence o lookup quando ambos vêm.

---

## O banco

`documentation/schema.sql` + `seed.sql` + `seed_regras.sql` + `schema_fts.sql`,
nesta ordem — o `rebuild` do FTS5 indexa as linhas que o seed já inseriu;
invertida, a ordem gera índice vazio e `/api/ranking` responde sem os atos do
diário.

| Tabela | Linhas | Conteúdo |
| --- | --- | --- |
| `municipio` | 417 | malha IBGE da Bahia inteira |
| `habilitacao_gac` | 417 | 367 habilitados, 50 não habilitados |
| `consorcio` | 29 | consórcios públicos de meio ambiente |
| `tipologia` | 9 | Divisão B do Anexo IV (mineração) |
| `tipologia_nivel_gestao` | 27 | tipologia × nível de gestão delegável |
| `classe_impacto` | 9 | classes de impacto da CEPRAM |
| `ato_diario_oficial` | 2.008 | atos coletados via Querido Diário |
| `ato_fts` | 2.008 | índice FTS5 sobre os atos |
| `licenca` | 19 | licenças municipais achadas pela pesquisa |
| `pesquisa_run` | 2 | rodadas de Deep Research (2025 fechado, 2026 parcial) |
| `regra` | 6 | regras de competência (+ `regra_condicao`, `regra_alerta`) |

**Nova lei de competência = linha nova no banco, não código novo.** As regras
vivem em `regra`/`regra_condicao`/`regra_alerta`, nunca numa `Regra` escrita à
mão em TypeScript.

---

## Pipelines de dados

Três pipelines independentes, todos rodados **antes** da demo. A aplicação
nunca chama API externa nem faz scraping ao vivo.

### 1. Geoespacial — `pipeline/prep.py`

```bash
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/prep.py
```

Idempotente: lê exclusivamente os brutos de `data_source/` e reescreve tudo
em `frontend/public/data/`. Para mudar o recorte, edite `pipeline/municipios.py`
e rode de novo.

| Artefato | Conteúdo | Tamanho |
| --- | --- | --- |
| `municipios10.geojson` | 10 feições, código IBGE e nome | 74 KB |
| `processos.geojson` | 2.585 processos com `municipios[]` e `cruza_divisa` | 3,6 MB |
| `indice_processos.json` | índice de busca, sem geometria | 588 KB |
| `candidatos_divisa.json` | 746 processos que cruzam divisa | 453 KB |
| `metadata.json` | parâmetros, contagens e procedência da execução | 2 KB |

`pipeline/relevo.py` é o **único passo que sai à rede**: baixa tiles
terrain-rgb do dataset público Terrain Tiles (AWS Open Data, CC0). Não há
bruto versionável equivalente — um DEM global não cabe no repo — então os
tiles baixados são o próprio artefato, committed como os demais dados.
`pipeline/relevo_cor.py` gera a tinta hipsométrica a partir deles, offline.

### 2. Coleta — `scripts/`

```bash
python scripts/collect_gac.py snapshot      # arquiva evidência das páginas-fonte
python scripts/collect_gac.py add ...       # registra cada checagem manual
python scripts/collect_querido_diario.py    # atos, só para quem está habilitado
python scripts/collect_contatos.py          # gera stubs, preenchidos à mão
python scripts/build_dataset.py             # consolida em data/processed/
python scripts/generate_seed_sql.py         # data/processed/ -> documentation/seed.sql
```

Cada registro carrega `fonte`/`fonte_url` e `data_consulta`. Sem isso o
registro é descartado com aviso por `build_dataset.py`.

### 3. Pesquisa — `research_pipeline/`

Pipeline LangGraph que transforma uma pesquisa Deep Research num produto de
dados reprodutível: um JSON onde cada registro é uma licença ambiental de
mineração concedida por um município baiano, com procedência obrigatória.

```
research_start → research → extract → normalize → validate → {repair | rank_and_emit}
   Gemini          Gemini    DeepSeek   DeepSeek    Python        Python puro
```

O laço offline custa zero e não exige nenhuma chave:

```bash
python -m research_pipeline.run --ano 2025 \
    --report research_pipeline/tests/fixtures/raw_report_2025_seed.md \
    --llm fixture
```

A perna paga (`--research gemini`, US$ 1–3/run; `--llm deepseek`, ~US$ 0,01/run)
e o ciclo trimestral completo estão em
[`research_pipeline/README.md`](research_pipeline/README.md). Detalhe que custa
dinheiro se ignorado: `research_pipeline/runs/` é gitignored, e o relatório
bruto perdido custa US$ 1–3 para refazer.

---

## Fontes e procedência

Todo dado exibido carrega fonte e data de consulta. As fontes primárias estão
versionadas **em bruto** no repositório, para que a base seja reproduzível sem
depender de nenhum site de terceiro continuar no ar.

| Fonte | Arquivo no repo | Coleta |
| --- | --- | --- |
| **SIGMINE / ANM** — processos minerários da Bahia | `data_source/BA-shapefile/BA.shp` | [dadosabertos.anm.gov.br](https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS/BA.zip) · **2026-07-31, 23h47** |
| **IBGE** — Malha Municipal Digital 2025, Bahia | `data_source/Malha municipal IBGE-BA/BA_Municipios_2025.shp` | [ibge.gov.br](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html) · **2026-02-03** |
| **Resolução CEPRAM 4.420/2015** — Anexo IV, grupo de mineração | `data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx` | 🚧 registrar |
| **Resolução CEPRAM 4.327/2013** — níveis de gestão municipal | `documentation/Resolucao-CEPRAM-4.327-2013.pdf` | 🚧 registrar |
| **Lei 6.567/1978** — regime de licenciamento mineral | `data_source/L6567.pdf` | 🚧 registrar |
| **Lei Complementar 140/2011** — competências ambientais | `data_source/Lcp 140.pdf` | conferida contra a fonte em 2026-08-02 |
| **Habilitação municipal (GAC)** | `data/processed/municipios_habilitados.json` | [gestor.meioambiente.ba.gov.br](https://gestor.meioambiente.ba.gov.br/Consultas/ConsultaGAC/) · **2026-08-01** |

As datas do SIGMINE e do IBGE são o carimbo de tempo do arquivo no disco de
quem baixou, não uma data digitada à mão.

Condições de uso de terceiros: a Malha Municipal Digital do IBGE está sujeita
à Nota Metodológica citada em
`data_source/Malha municipal IBGE-BA/LEIA-ME.txt`.

---

## Estrutura do repositório

```
data_source/            brutos versionados, nunca editados à mão
                          BA-shapefile/            SIGMINE — 31.488 poligonais
                          Malha municipal IBGE-BA/ 417 municípios
pipeline/               pré-processamento geoespacial (prep.py, relevo*.py)
scripts/                coleta e consolidação (GAC, Querido Diário, seed SQL)
research_pipeline/      LangGraph: Deep Research -> licenças municipais
common/                 utilitários compartilhados (texto, DBF)
data/
  processed/              JSONs consolidados, lidos pelo gerador de seed
  db/licenciamento.db     gitignored — derivado, recriável
documentation/
  schema.sql seed.sql seed_regras.sql schema_fts.sql
  ENTENDIMENTO_PROJETO.md  arquitetura de ponta a ponta
  CONTEXTO_PROJETO.md
backend/src/
  server.ts               Express: API + SPA na mesma origem
  db.ts                   leitura do SQLite (readOnly)
  ranking.ts              motor de viabilidade de protocolo
  busca-atos.ts           consulta FTS5 sobre os atos do diário
frontend/
  public/data/            artefatos do pipeline, consumidos em runtime
  src/lib/schemas.ts      ⚠️ CONTRATO CONGELADO
  src/lib/motor.ts        ⚠️ Escopo D — assinatura definitiva, corpo provisório
  src/lib/fatos.ts        formulário -> FactBase
  src/lib/porte.ts        faixas, fronteiras e escala do controle
  src/lib/api.ts          cliente do backend, com degradação graciosa
  src/parecer/            a tela — veredito, mapa, caracterização, ranking
Dockerfile              imagem de deploy (contêiner único, Cloud Run)
docker/                 sqlite-web para navegar o banco
```

---

## Premissas declaradas

1. **O município é derivado, não lido.** O shapefile do SIGMINE não traz
   atributo de município confiável. Cada poligonal é intersectada contra as
   417 feições da malha IBGE e recebe `municipios[]` com a proporção de área
   em cada uma.

2. **Área calculada em projeção equivalente.** Proporção de área medida em
   graus decimais dá número errado. O cálculo usa uma cônica de área igual
   (Albers, parâmetros IBGE); a string PROJ está em `pipeline/prep.py` e é
   registrada em `metadata.json`.

3. **Fatias de borda abaixo de 0,5% da poligonal *e* de 0,5 ha são
   descartadas.** Dois shapefiles de origens diferentes produzem lascas de
   alguns metros quadrados nas divisas; sem esse corte, quase todo processo de
   borda apareceria falsamente como cruzando divisa.

4. **Processo é a unidade, não o polígono.** Quando a área outorgada é
   descontínua, o SIGMINE traz várias feições com o mesmo número. Elas são
   dissolvidas.

5. **Escopo de municípios é o que a evidência sustenta.** A habilitação GAC
   cobre os 417 municípios. O recorte geoespacial de 10 municípios é da
   amostra de poligonais, não do cadastro. O que não for confirmado — nem sim,
   nem não — vira `sem_evidencia`, que o motor traduz em `INDETERMINADO`.

6. **Só se exibe prazo legal, nunca prazo observado.** O prazo legal vem da
   norma e é verificável. As médias de tempo de análise que circulam no setor
   referem-se a processos da ANM, não a licenciamento ambiental; misturar as
   duas coisas num mesmo gráfico é erro material.

7. **O produto exibe o limiar; não recomenda ficar abaixo dele.** Mostrar
   "acima de X t/ano a competência passa ao Estado" é informação. Sugerir
   declarar menos, ou fracionar a área para permanecer numa faixa menor, seria
   orientar fracionamento irregular.

---

## Limitações declaradas

- **`Parecer.trilha_selecionada`, `opcoes`, `prazo_legal_total_dias`,
  `n_licencas` e `anuencias` saem sempre vazios.** Os tipos existem no schema
  congelado, mas não há implementação nem dado. Hoje o produto responde "quem
  licencia" e "com que fundamento" — não "por qual trilha" nem "em quantos
  dias".
- **Anuências acessórias** (ASV, recurso hídrico, explosivos) são coletadas no
  formulário e viram fatos no `FactBase`, mas nenhuma regra as consome ainda —
  são fatos órfãos.
- `frontend/src/lib/motor.ts` se autodeclara `STUB_D`: a mecânica é funcional,
  mas parte dos dados que ela consome ainda vem de fixtures.
- O SIGMINE é um retrato da data de coleta. Processos protocolados depois não
  estão na base.
- 784 registros do shapefile trazem `UF = DADO NÃO CADASTRADO`. Não foram
  descartados: a incidência municipal é decidida pela geometria, não pelo
  atributo.
- 23 geometrias inválidas do bruto foram corrigidas por `make_valid`, o que
  altera minimamente a fronteira dessas poligonais.
- A malha municipal é simplificada a 8% (Visvalingam, com preservação de
  topologia) para caber no orçamento de 300 KB. As poligonais dos processos
  **não** são simplificadas.
- Os atos do diário oficial são **excertos, não leis** — a interface avisa
  isso, e eles alteram apenas a confiança do ranking, nunca a posição.
- Divergência conhecida: as transcrições da LC 140/2011 em `ranking.ts` foram
  conferidas contra a fonte primária (`verificado: true`); as mesmas normas em
  `documentation/seed_regras.sql` ainda saem com `fundamento_verificado = 0`.
  Vale alinhar — não é divergência de fato.

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha só o que o caminho em que você
está exige. **Todo o caminho offline roda sem nenhuma chave.**

| Variável | Efeito |
| --- | --- |
| `GEMINI_API_KEY` | exigida por `--research gemini` (US$ 1–3 por run) |
| `DEEPSEEK_API_KEY` | exigida por `--llm deepseek` (~US$ 0,01 por run) |
| `RP_LLM` | padrão de `--llm` (`fixture` \| `deepseek`) |
| `RP_RESEARCH` | padrão de `--research` (`none` \| `gemini`) |
| `DB_PATH` | caminho do SQLite lido pelo backend |
| `FRONTEND_DIST` | bundle do Vite servido pelo Express |
| `PROCESSOS_GEOJSON` | índice de poligonais do `/api/ranking` |
| `PORT` | porta do backend (3001 local, 8080 no contêiner) |

---

## Licença

[CC BY-NC 4.0](LICENSE) — uso comercial vedado, conforme item 10.4 do
regulamento. Os brutos de terceiros em `data_source/` mantêm as condições de
suas fontes originais.
