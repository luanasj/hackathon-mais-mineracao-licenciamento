# Pipeline de Pesquisa Profunda — Licenciamento Ambiental de Mineração (Bahia)

> **Status:** escopo definido, implementação não iniciada.
> **Branch:** `feature/deep-research-pipeline`
> **Documento de escopo — versão 1.0 — 2026-08-01**

---

## 1. Contexto e problema

O `documentation/BACKLOG.md` define o **Motor de Enquadramento Licenciatório**: dado um
empreendimento minerário, dizer qual ente é competente (União / Estado / Município) e qual
o rito de licenciamento. Esse motor depende de uma base factual que **hoje não existe**:
quais municípios baianos — normalmente via **consórcios públicos intermunicipais** — de fato
concederam licenças ambientais para mineração, com que nível de gestão, para qual tipologia
e qual mineral.

Essa informação está espalhada em diários oficiais municipais, portarias de consórcios e
publicações do CEPRAM. O arquivo `research_pipeline/gemini_deep_research_test.md` registra um
**teste manual** com o Gemini Deep Research que provou a viabilidade: o PROMPT 2 (ano 2025)
retornou uma tabela com município, consórcio, titular, nível, modalidade e data. O problema
é que esse resultado é (a) manual, (b) não reprodutível, (c) texto livre — não é dado.

**Este pipeline transforma esse teste manual em um produto de dados reprodutível.**

### Fora de escopo

- O motor de enquadramento em si (backlog tasks D.x).
- Scraping de portais municipais — já rejeitado no backlog (task C.2: *"O que não fazer: varrer portal de município"*).
- Join espacial SIGMINE × malha IBGE (backlog task A.3).
- Verificação humana das linhas extraídas (o pipeline entrega `verificado: false`).

---

## 2. Objetivo

> Produzir, de forma automatizada e reprodutível, um **JSON estruturado e validado** em que
> cada registro é **uma licença ambiental de mineração concedida** por um município baiano
> (isoladamente ou via consórcio) em um determinado ano, com `municipio` e `consorcio`
> **normalizados contra as tabelas canônicas do nosso banco**, com `tipologia` mapeada ao
> **vocabulário fechado do Anexo IV / Divisão B (CEPRAM)**, `mineral` normalizado, e
> **procedência (fonte + data de consulta) obrigatória em toda linha**.

O produto final do pipeline é **o JSON estruturado**. Nada mais.

### Critérios de aceite

1. `python -m research_pipeline.run --ano 2025` produz um JSON que valida contra o schema Pydantic sem erro.
2. Toda linha tem ao menos uma `fonte_url` e uma `data_consulta`.
3. Todo `municipio_id` e `consorcio_id` não-nulo existe nos arquivos canônicos.
4. Toda `tipologia_codigo` não-nula pertence ao vocabulário fechado (§6.3).
5. Rodar duas vezes o mesmo ano produz JSONs com o **mesmo formato e as mesmas chaves**; divergências ficam restritas às *descobertas* da pesquisa, não à sua estrutura.
6. O ranking é calculado em Python por contagem — **nunca pedido a um LLM**.
7. Uma execução interrompida retoma do checkpoint sem repagar a tarefa de Deep Research.

---

## 3. Arquitetura — LangGraph

Grafo linear com estado tipado, um checkpointer SQLite e artefatos em disco.

```
                    ┌──────────────────────────────────────────┐
   --ano 2025 ─────▶│ 0. load_refs                             │
                    │    municipios.json + consorcios.json     │
                    │    + vocabulário de tipologias (XLSX)    │
                    │    + vocabulário de minerais (SIGMINE)   │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
   ETAPA 1          │ 1. deep_research            [Gemini]     │
   pesquisa         │    prompt versionado (§5)                │
                    │    background=True, store=True, polling  │
                    │    → relatório markdown + citações       │
                    └────────────────────┬─────────────────────┘
                                         │ salva raw_report.md
                                         ▼
                    ┌──────────────────────────────────────────┐
   ETAPA 2a         │ 2. extract                  [DeepSeek]   │
   estruturação     │    deepseek-v4-flash, temp 0, JSON mode  │
                    │    relatório → LicencaBruta[]            │
                    │    (nomes crus, sem normalizar)          │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
   ETAPA 2b         │ 3. normalize                [DeepSeek]   │
   normalização     │    deepseek-v4-flash, temp 0, JSON mode  │
                    │    municipio/consorcio → ids canônicos   │
                    │    substância → tipologia + mineral      │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │ 4. validate      Pydantic + regras duras │
                    │    ok ──▶ 5 │ falha ──▶ repair (máx. 2)  │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │ 5. rank_and_emit         Python puro     │
                    │    contagem, ordenação, escrita do JSON  │
                    └──────────────────────────────────────────┘
```

**Por que dois agentes DeepSeek e não um.** Extração ("o que o relatório diz") e normalização
("a que entidade do nosso banco isso corresponde") falham de formas diferentes e precisam de
prompts, vocabulários e validações diferentes. O nó `extract` não vê as listas canônicas — ele
não pode inventar um município que existe no banco mas não no relatório. O nó `normalize` não
vê o relatório — ele não pode inventar uma licença. Essa separação é a principal defesa contra
alucinação.

### Estado do grafo

```python
class PipelineState(TypedDict):
    ano: int
    refs: ReferenceData          # municípios, consórcios, tipologias, minerais
    prompt_version: str
    interaction_id: str | None   # id da tarefa Deep Research (para retomada)
    raw_report: str | None
    citations: list[Citation]
    licencas_brutas: list[dict]
    licencas_normalizadas: list[dict]
    validation_errors: list[str]
    repair_attempts: int
    output_path: str | None
```

---

## 4. Etapa 1 — Gemini Deep Research

**Contrato da API** (confirmado em `ai.google.dev/gemini-api/docs/deep-research`):

| Item | Valor |
|---|---|
| Modelo | `deep-research-preview-04-2026` (padrão) · `deep-research-max-preview-04-2026` (profundo) |
| Chamada | `client.interactions.create(input=..., agent=..., background=True, store=True)` |
| Execução | assíncrona — polling obrigatório; até **60 min** por tarefa |
| Resposta | `interaction.steps[-1].content[0].text` + citações fundamentadas |
| Ferramentas | Google Search, URL Context, Code Execution (padrão) |
| **Structured output** | **não suportado** — é exatamente por isso que a Etapa 2 existe |
| Custo | ~US$ 1–3 por tarefa (~US$ 3–7 no `max`) |

**Escopo de uma execução:** um ano, toda a Bahia. Uma única tarefa de Deep Research por run.
O `--ano` é o único parâmetro obrigatório. Multi-ano = múltiplas execuções.

**Configuração fixa:** `thinking_summaries="auto"`, `visualization="none"`,
`collaborative_planning=false` (planejamento colaborativo introduz variação entre execuções).

**Retomada:** o `interaction_id` vai para o checkpoint assim que a tarefa é criada. Se o
processo morrer durante o polling, a retomada refaz o polling da mesma tarefa em vez de criar
uma nova — é o que evita repagar os US$ 1–3.

---

## 5. Determinismo — o prompt travado

Deep Research é inerentemente variável: a web muda, o agente escolhe caminhos diferentes.
**Não é possível — nem desejável — travar as descobertas.** O que travamos é a *forma*.

O prompt vive em `research_pipeline/prompts/deep_research_v1.md`, versionado, com
`{{ANO}}` como único placeholder. O `prompt_version` é gravado no manifesto de cada run,
para que qualquer JSON possa ser rastreado até o prompt exato que o gerou.

O prompt melhorado, em relação aos testes manuais, precisa **exigir explicitamente**:

1. **Uma linha por licença concedida**, não por município — o teste manual já fez isso certo no PROMPT 2 (Caturama aparece duas vezes) e errado no PROMPT 1.
2. **Colunas fixas e nomeadas**, sempre nesta ordem:
   `Município | Consórcio | Titular | Substância/Mineral | Tipologia | Nível (1/2/3) | Modalidade (LP/LI/LO/LAU/LU/Renovação) | Nº da licença/portaria | Data (AAAA-MM-DD) | Fonte (URL) | Trecho citado`
3. **Data ISO ou `null`** — nunca `"Fevereiro/2025"` nem `"Ativa em 2026"`, que apareceram no teste manual e não são datas.
4. **Toda linha com URL de fonte.** Sem fonte verificável, a linha não entra na tabela — vai para uma seção separada "Indícios não confirmados".
5. **Proibição explícita de inferir o campo `nível`.** No PROMPT 2 todas as 8 linhas vieram "Nível 3", o que é suspeito de ser preenchimento por padrão. Se o nível não estiver no documento, deve vir `null`.
6. **Proibição de ranquear.** O ranking é derivado em Python (§8). Pedir ranking ao LLM introduz variação e convida à invenção de linhas para preencher posições.
7. **Fontes prioritárias declaradas:** diários oficiais municipais, sites e portarias dos consórcios públicos intermunicipais, publicações do CEPRAM/INEMA, SICOM/TCM-BA.
8. **Cobertura explícita:** varrer os consórcios ambientais baianos conhecidos, e reportar explicitamente os que foram consultados sem resultado — silêncio ≠ ausência.

Do lado do LLM estruturador, determinismo é forte: `temperature=0`, JSON mode, schema Pydantic,
até **2 tentativas de reparo** com a mensagem de erro de validação realimentada.

---

## 6. Etapa 2 — DeepSeek (dois agentes)

Modelo em ambos os nós: **`deepseek-v4-flash`** — 1M de contexto (o relatório inteiro cabe
com folga), JSON output e tool calls suportados, US$ 0,14/1M in · US$ 0,28/1M out.
`temperature=0` nos dois.

### 6.1 Nó `extract`

**Entrada:** relatório markdown cru + citações. **Não recebe as listas canônicas.**
**Saída:** `list[LicencaBruta]` — transcrição fiel, nomes como aparecem no texto.

```json
{
  "municipio_raw": "Caturama",
  "consorcio_raw": "Consórcio Bacia do Paramirim",
  "titular": "Empreendimento (Processo Técnico nº 013/2024)",
  "substancia_raw": "areia",
  "tipologia_raw": null,
  "nivel_licenciamento": 3,
  "modalidade": "LAU",
  "numero_licenca": "01/2025",
  "data_concessao": "2025-02-04",
  "fonte_urls": ["https://..."],
  "trecho_citado": "Licença Ambiental Unificada Nº 01/2025, de 04 de fevereiro de 2025..."
}
```

Regra dura: **campo ausente no relatório → `null`.** Nunca inferir, nunca preencher por padrão.

### 6.2 Nó `normalize`

**Entrada:** `list[LicencaBruta]` + as quatro tabelas canônicas. **Não recebe o relatório.**
**Saída:** `list[LicencaNormalizada]` — cada bruta acrescida dos campos canônicos.

Política de correspondência — **decisão do usuário: sempre atribuir o candidato mais próximo.**
O agente é obrigado a escolher um `municipio_id` e um `consorcio_id`, mesmo com grafia divergente
("Caetite" → "Caetité", "CIVALERG" → "Consórcio do Vale do Rio Gavião").
Como contrapeso obrigatório, toda atribuição carrega:

- `municipio_match_confianca` / `consorcio_match_confianca` — float 0–1
- `municipio_match_metodo` / `consorcio_match_metodo` — `exato` · `alias` · `fuzzy` · `inferido`
- o `*_raw` original, sempre preservado

Correspondências com confiança `< 0.7` entram em `avisos[]` no manifesto do run. Assim ninguém
descobre um join errado só quando o dado já está no banco.

Pré-filtro barato antes do LLM: normalização Unicode + `rapidfuzz` contra nomes e aliases.
Acerto exato/alias resolve sem chamar o modelo; o LLM só decide os casos ambíguos.

### 6.3 Vocabulário fechado de tipologia

Extraído de `data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx` (aba *Divisão B - Mineração*).
São **17 tipologias-folha**; o agente escolhe um código, ou `null`:

| Código | Tipologia (resumo) | P.P. |
|---|---|---|
| B1.1.1 | Ferro | A |
| B1.1.2 | Manganês | A |
| B1.1.3 | Demais minerais metálicos (Alumínio, Cobre, Níquel, Ouro, Lítio, Nióbio…) | A |
| B1.2.1 | Criolita, Enxofre, Fluorita, Selênio, Silício, Silicatos, Telúrio | A |
| B2.1 | Gemas (Ágata, Água-marinha, Opala, Rubi, Safira, Topázio, Turmalina…) | M |
| B2.2 | Ametista, Diamante, Esmeralda | A |
| B3.1 | Areias, Arenoso, Cascalhos, Filitos e Saibro | M |
| B3.2 | Areias em recursos hídricos | M |
| B3.3 | Caulim | A |
| B3.4 | Basalto, Calcários, Gnaisses, Granitos, Quartzitos… (agregados/britagem) | M |
| B3.5 | Ardósia, Dioritos, Granitos, Mármores, Quartzos, Sienitos (revestimento) | A |
| B4.1 | Argilas, Caulinita, Diatomita, Ilita, Caulim | M |
| B4.2 | Cianita, Feldspato, Quartzo… (vidro, esmaltação, óptica, eletrônica) | M |
| B4.3 | Apatita, Calcário dolomítico, Fosfatos, Potássio… (fertilizantes) | A |
| B4.4 | Andalusita, Grafita, Pegmatito, Vermiculita, Xisto… (uso industrial) | M |
| B4.5 | Anidrita, Barita, Bentonita, Gipsita, Magnesita, Talco | A |
| B4.6 | Amianto | A |

Duas armadilhas conhecidas, a tratar no carregador:

- **B4.2 tem `#ERROR!`** na coluna PORTE PEQUENO e o texto *"(faixa não expressa na publicação oficial)"* em PORTE MÉDIO. O carregador deve emitir `porte_pequeno = None` e registrar um aviso — nunca `0`.
- **Granito aparece em B3.4 e B3.5.** A desambiguação é pelo *uso* (agregado/britagem vs. revestimento). O prompt de normalização deve dizer isso explicitamente e, na dúvida, devolver `null` com justificativa em vez de chutar.

**Mineral:** normalizado contra os 169 valores distintos de `SUBS` em
`data_source/BA-shapefile/BA.dbf` (SIGMINE/ANM) — o mesmo vocabulário que o resto do projeto
usará no join espacial. Preserva-se sempre `substancia_raw`.

---

## 7. Dados canônicos e o carregador com mapeamento

**Você fornecerá** `municipios.json` e `consorcios.json`. Para não acoplar o código às suas
chaves, o carregador lê um arquivo de mapeamento de campos —
`research_pipeline/config/ref_mapping.yaml`:

```yaml
municipios:
  path: data/municipios.json
  root: null              # ou "data", "items"… se o array estiver aninhado
  fields:
    id: id                # ← chave no SEU arquivo
    nome: nome
    codigo_ibge: codigo_ibge
    aliases: aliases      # opcional; ausente → []

consorcios:
  path: data/consorcios.json
  root: null
  fields:
    id: id
    nome: nome
    sigla: sigla          # opcional
    aliases: aliases      # opcional
    municipios_ids: municipios   # opcional
```

O carregador normaliza para um modelo interno (`Municipio`, `Consorcio`), valida na
inicialização e **falha alto** se um campo mapeado não existir — nada de descobrir isso no meio
de uma tarefa de US$ 3.

Fallback: se `municipios.json` não for fornecido, um script gera a lista dos 417 municípios
baianos a partir de `data_source/Malha municipal IBGE-BA/BA_Municipios_2025.dbf`
(**atenção: encoding Latin-1**, conforme o `.cpg`). Para consórcios não há fallback — hoje
o repositório não tem nenhuma lista de consórcios intermunicipais, e essa é a maior lacuna
de dados de referência do projeto.

---

## 8. Saída — o produto final

Um registro = **uma licença concedida**. O ranking é derivado, nunca pedido ao LLM.

```json
{
  "meta": {
    "ano_referencia": 2025,
    "gerado_em": "2026-08-01T14:32:00Z",
    "prompt_version": "deep_research_v1",
    "modelo_pesquisa": "deep-research-preview-04-2026",
    "modelo_estruturacao": "deepseek-v4-flash",
    "run_id": "2025_20260801T143200Z",
    "total_licencas": 8,
    "avisos": ["consorcio_match_confianca < 0.7 em 1 registro"]
  },
  "licencas": [
    {
      "id": "2025-caturama-lau-01",
      "municipio_id": "2907103",
      "municipio_nome": "Caturama",
      "municipio_raw": "Caturama",
      "municipio_match_metodo": "exato",
      "municipio_match_confianca": 1.0,
      "consorcio_id": "cons-bacia-paramirim",
      "consorcio_nome": "Consórcio Bacia do Paramirim",
      "consorcio_raw": "Consórcio Bacia do Paramirim",
      "consorcio_match_metodo": "exato",
      "consorcio_match_confianca": 1.0,
      "titular": "Empreendimento (Processo Técnico nº 013/2024)",
      "mineral": "AREIA",
      "substancia_raw": "areia",
      "tipologia_codigo": "B3.1",
      "tipologia_nome": "Areias, Arenoso, Cascalhos, Filitos e Saibro",
      "potencial_poluidor": "M",
      "nivel_licenciamento": 3,
      "modalidade": "LAU",
      "numero_licenca": "01/2025",
      "data_concessao": "2025-02-04",
      "fonte_urls": ["https://..."],
      "trecho_citado": "Licença Ambiental Unificada Nº 01/2025...",
      "data_consulta": "2026-08-01",
      "verificado": false
    }
  ],
  "ranking_municipios": [
    { "posicao": 1, "municipio_id": "2907103", "municipio_nome": "Caturama",
      "consorcio_nome": "Consórcio Bacia do Paramirim", "total_licencas": 2 }
  ],
  "ranking_consorcios": [
    { "posicao": 1, "consorcio_id": "cons-bacia-paramirim", "total_licencas": 2,
      "municipios_atendidos": 1 }
  ]
}
```

`verificado: false` é sempre a saída do pipeline — atende à exigência do backlog
(*"cada linha da base tem procedência"*) sem fingir uma verificação humana que não houve.
Empates no ranking recebem a mesma posição e são desempatados por nome, para que o ranking
seja estável entre execuções.

---

## 9. Persistência

`SqliteSaver` do LangGraph em `research_pipeline/runs/checkpoints.db`, mais artefatos em disco:

```
research_pipeline/runs/2025_20260801T143200Z/
├── manifest.json         parâmetros, versões, custos, avisos, timings
├── prompt.md             o prompt exato enviado (após substituição de {{ANO}})
├── raw_report.md         resposta bruta do Deep Research
├── citations.json        citações/grounding metadata
├── extracted.json        saída do nó extract
└── licencas_2025.json    ← PRODUTO FINAL
```

Retomada: `--resume <run_id>`. Um relatório já salvo em disco pula o nó `deep_research`
por inteiro, o que permite iterar de graça nos prompts do DeepSeek usando um relatório real.

---

## 10. Stack

| Camada | Escolha |
|---|---|
| Orquestração | `langgraph` + `langchain-core` |
| Pesquisa | `google-genai` (Deep Research Interactions API) |
| Estruturação | `langchain-openai` apontando para o endpoint compatível da DeepSeek |
| Schemas | `pydantic` v2 |
| Fuzzy match | `rapidfuzz` |
| Leitura de referências | `openpyxl` (XLSX), `dbfread` (DBF), `PyYAML` |
| Checkpoint | `langgraph-checkpoint-sqlite` |
| Config | `.env` → `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` |

`requirements.txt` precisa ser criado — o `devcontainer.json` já o invoca no
`postCreateCommand` e **hoje esse comando falha**, porque o arquivo não existe.

Estrutura de código prevista:

```
research_pipeline/
├── GOAL.md                    ← este documento
├── gemini_deep_research_test.md
├── prompts/
│   ├── deep_research_v1.md
│   ├── extract_v1.md
│   └── normalize_v1.md
├── config/ref_mapping.yaml
├── schemas.py                 Pydantic: LicencaBruta, LicencaNormalizada, Municipio, Consorcio…
├── refs.py                    carregador com mapeamento + vocabulários
├── nodes/{research,extract,normalize,validate,emit}.py
├── graph.py
└── run.py                     CLI
```

---

## 11. Riscos assumidos

| Risco | Mitigação |
|---|---|
| Não existe lista canônica de consórcios baianos no repositório | Bloqueia a normalização de `consorcio`. Você fornecerá o JSON; sem ele, o campo sai `null` e o pipeline registra o aviso. |
| "Sempre atribuir o mais próximo" pode gerar joins errados no banco | `*_raw` preservado, método e confiança em toda linha, confiança `< 0.7` promovida a aviso no manifesto. |
| Deep Research pode alucinar licenças plausíveis | `fonte_url` + `trecho_citado` obrigatórios; sem fonte a linha não entra. `verificado: false` sempre. |
| Cobertura variável entre execuções | Aceito por decisão de escopo. Travamos a forma, não os achados. O `run_id` mantém cada resultado auditável. |
| `nivel_licenciamento` uniforme (todos "Nível 3" no teste manual) sugere preenchimento por padrão | Prompt proíbe inferência; sem documento, `null`. Um alerta é emitido se >90% das linhas tiverem o mesmo nível. |
| API Deep Research em *preview* | ID do modelo fixado no manifesto; a camada de pesquisa fica atrás de uma interface para permitir troca. |
| Municípios do teste (Caturama, Tremedal, Pintadas…) não intersectam os 10 do BACKLOG | Sinal de que a pesquisa e as fixtures do motor estão desalinhadas. Decidir mais adiante se o pipeline deve ser restringido aos 10 municípios do MVP. |

---

## 12. Decisões travadas

| # | Decisão |
|---|---|
| 1 | Deep Research via API oficial (`deep-research-preview-04-2026`), assíncrona com polling. |
| 2 | Uma execução = um ano, toda a Bahia. Uma única tarefa de pesquisa por run. |
| 3 | `municipios.json` e `consorcios.json` fornecidos pelo usuário; lidos via `ref_mapping.yaml`. |
| 4 | Normalização sempre atribui o candidato mais próximo, com método + confiança obrigatórios. |
| 5 | Procedência obrigatória: `fonte_urls`, `trecho_citado`, `data_consulta`, `verificado: false`. |
| 6 | Grão do JSON: uma licença concedida por registro; ranking derivado em Python. |
| 7 | `tipologia` restrita ao vocabulário fechado do Anexo IV; `mineral` ao vocabulário SIGMINE. |
| 8 | Determinismo por prompt versionado + `temperature=0` + schema + até 2 reparos. |
| 9 | Dois agentes DeepSeek `deepseek-v4-flash`: `extract` e `normalize`, com entradas disjuntas. |
| 10 | `SqliteSaver` + artefatos por run em `research_pipeline/runs/<run_id>/`. |
