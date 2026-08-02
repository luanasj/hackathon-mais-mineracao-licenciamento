# Pipeline de Pesquisa Profunda — Licenciamento Ambiental de Mineração (Bahia)

> **Status:** escopo definido, implementação não iniciada.
> **Branch:** `feature/deep-research-pipeline`
> **Documento de escopo — versão 1.4 — 2026-08-01**
> *v1.4: correções factuais verificadas contra os arquivos reais (encoding do DBF, `visualization`, sentinela do XLSX, substâncias ambíguas, sigla e prefixo de consórcio) e decisões E–H registradas (§12).*
>
> *v1.5: `modalidade` fora do vocabulário deixa de derrubar a linha — vira `"Outra"` com a grafia original em `modalidade_raw` (§6.1). Medido contra o relatório real de 2025, que perdia licenças em silêncio.*
> *v1.3: dados canônicos reais em `data/processed/` — formato, aliases derivados e cruzamento município↔consórcio (§6.2, §7, §11).*
> *v1.2: prompt de pesquisa sem lista de municípios — pergunta em aberto, rigidez só no formato de saída (§5, §7.1).*
> *v1.1: `licenciado_por` como indicador obrigatório (§6.4); universo ampliado para todos os municípios aptos (§7.1).*

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
> em um determinado ano, registrando explicitamente **se o licenciamento foi feito pelo próprio
> município ou por meio de consórcio**, com `municipio` e `consorcio`
> **normalizados contra as tabelas canônicas do nosso banco**, com `tipologia` mapeada ao
> **vocabulário fechado do Anexo IV / Divisão B (CEPRAM)**, `mineral` normalizado, e
> **procedência (fonte + data de consulta) obrigatória em toda linha**.

**Universo:** todos os municípios baianos com competência para licenciar — não apenas os 10
do MVP do backlog (§7.1).

O produto final do pipeline é **o JSON estruturado**. Nada mais.

### Critérios de aceite

1. `python -m research_pipeline.run --ano 2025` produz um JSON que valida contra o schema Pydantic sem erro.
2. Toda linha tem ao menos uma `fonte_url` e uma `data_consulta`.
3. Todo `municipio_id` não-nulo pertence aos **417** `codigo_ibge` de `municipios_habilitados.json`; todo `consorcio_id` não-nulo pertence aos **29** ids de `consorcios.json`.
4. Toda `tipologia_codigo` não-nula pertence ao vocabulário fechado (§6.3).
5. Rodar duas vezes o mesmo ano produz JSONs com o **mesmo formato e as mesmas chaves**; divergências ficam restritas às *descobertas* da pesquisa, não à sua estrutura.
6. O ranking é calculado em Python por contagem — **nunca pedido a um LLM**.
7. Uma execução interrompida retoma do checkpoint sem repagar a tarefa de Deep Research.
8. O carregador confere na inicialização: 417 municípios, 29 consórcios, `sum(total_municipios) == 386`, união dos membros ⊆ chaves de municípios. Divergência **falha alto**, antes de qualquer chamada de API.

---

## 3. Arquitetura — LangGraph

Grafo linear com estado tipado, um checkpointer SQLite e artefatos em disco.

```
                    ┌──────────────────────────────────────────┐
   --ano 2025 ─────▶│ 0. load_refs                             │
                    │    data/processed/                       │
                    │      municipios_habilitados.json (417)   │
                    │      consorcios.json (29)                │
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
    run_id: str
    prompt_version: str
    interaction_id: str | None   # id da tarefa Deep Research (para retomada)
    raw_report: str | None
    citations: list[Citation]    # definido em schemas.py: url, titulo, trecho, indice
    licencas_brutas: list[dict]
    licencas_normalizadas: list[dict]
    validation_errors: list[str]
    avisos: list[str]            # alimenta meta.avisos (§8)
    repair_attempts: int
    output_path: str | None
    manifest_path: str | None
```

**`refs` não entra no estado** (decisão 18). `SqliteSaver` serializa o estado inteiro a cada
checkpoint, e `ReferenceData` carrega 417 municípios + 29 consórcios + 17 tipologias + 169
minerais — dezenas de milhares de campos regravados por passo, sem nenhum ganho. As referências
são carregadas uma vez pelo nó `load_refs` e trafegam em
`config["configurable"]["refs"]`, que o LangGraph não persiste.

---

## 4. Etapa 1 — Gemini Deep Research

**Contrato da API** (confirmado em `ai.google.dev/gemini-api/docs/deep-research`):

| Item | Valor |
|---|---|
| Modelo | `deep-research-preview-04-2026` (padrão) · `deep-research-max-preview-04-2026` (profundo) |
| Chamada | `client.interactions.create(input=..., agent=..., background=True, store=True, agent_config={...})` |
| Execução | assíncrona — polling obrigatório; até **60 min** por tarefa |
| Resposta | `interaction.steps[-1].content[0].text` + citações fundamentadas |
| Ferramentas | Google Search, URL Context, Code Execution (padrão) |
| **Structured output** | **não suportado** — é exatamente por isso que a Etapa 2 existe |
| Custo | ~US$ 1–3 por tarefa (~US$ 3–7 no `max`) |

**Escopo de uma execução:** um ano, toda a Bahia. Uma única tarefa de Deep Research por run.
O `--ano` é o único parâmetro obrigatório. Multi-ano = múltiplas execuções.

**Configuração fixa.** Os flags do agente **não são kwargs soltos** — vão dentro de `agent_config`,
e `visualization` aceita só `"auto"` ou `"off"` (`"none"` é rejeitado):

```python
client.interactions.create(
    input=prompt,
    agent="deep-research-preview-04-2026",
    background=True,
    store=True,
    agent_config={
        "type": "deep-research",
        "thinking_summaries": "auto",
        "visualization": "off",
        "collaborative_planning": False,   # introduz variação entre execuções
    },
)
```

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
   `Município | Consórcio | Órgão emissor | Licenciado por (município próprio / consórcio) | Titular | Substância/Mineral | Tipologia | Nível (1/2/3) | Modalidade (LP/LI/LO/LAU/LU/Renovação) | Nº da licença/portaria | Data (AAAA-MM-DD) | Fonte (URL) | Trecho citado`
3. **Quem licenciou — município por conta própria ou via consórcio.** Indicador de primeira classe (§6.4). O relatório deve nomear o **órgão emissor** (secretaria municipal de meio ambiente vs. consórcio público) e citar o trecho que sustenta a atribuição. Sem evidência, `indeterminado` — nunca deduzir a partir do simples fato de o município integrar um consórcio.
4. **Data ISO ou `null`** — nunca `"Fevereiro/2025"` nem `"Ativa em 2026"`, que apareceram no teste manual e não são datas.
5. **Toda linha com URL de fonte.** Sem fonte verificável, a linha não entra na tabela — vai para uma seção separada "Indícios não confirmados".
6. **Proibição explícita de inferir o campo `nível`.** No PROMPT 2 todas as 8 linhas vieram "Nível 3", o que é suspeito de ser preenchimento por padrão. Se o nível não estiver no documento, deve vir `null`.
7. **Proibição de ranquear.** O ranking é derivado em Python (§8). Pedir ranking ao LLM introduz variação e convida à invenção de linhas para preencher posições.
8. **Fontes prioritárias declaradas:** diários oficiais municipais, sites e portarias dos consórcios públicos intermunicipais, publicações do CEPRAM/INEMA, SICOM/TCM-BA.
9. **Cobertura pedida em aberto:** "municípios da Bahia" — sem enumerar. O prompt **não carrega lista de municípios nem de consórcios**; quem descobre quais entes licenciaram é a pesquisa. Listas canônicas existem só no nó `normalize` (§6.2), nunca aqui.

**O que o prompt trava é o formato de saída, não o universo pesquisado.** Colunas, ordem, tipos,
regras de `null` e obrigatoriedade de fonte: rígidos. Quais municípios aparecem: livre.
Injetar 417 nomes no prompt de pesquisa enviesaria o agente a preencher linhas por nome
reconhecido e inflaria o contexto sem ganho de recall.

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

**`modalidade` fora das 6 do §5 vira `"Outra"`, com a grafia original em `modalidade_raw`.** O
prompt de pesquisa continua pedindo `LP/LI/LO/LAU/LU/Renovação` e o vocabulário continua fechado —
o que muda é o destino do que não está nele. Recusar a linha (comportamento até v1.4) apagava
licenças reais em silêncio: o relatório de 2025 traz `"Licença Específica"` e
`"Licença de Alteração"` escritos por prefeituras, e cada um derrubava a linha inteira sem
aparecer no `validation_errors` do produto, porque o manifesto conta só o que sobreviveu. `"Outra"`
não é uma sétima modalidade: é a ausência de classificação, e quem a lê tem de ler
`modalidade_raw` junto. Valor **não textual** no campo (número, objeto) continua erro duro — ali
não há licença real por trás.

```json
{
  "municipio_raw": "Caturama",
  "consorcio_raw": "Consórcio Bacia do Paramirim",
  "orgao_emissor_raw": "Consórcio Público Interfederativo da Bacia do Paramirim",
  "licenciado_por_raw": "consorcio",
  "licenciado_por_evidencia": "Licença assinada pelo Diretor Técnico do Consórcio...",
  "licenciado_por_confianca": 0.95,
  "titular": "Empreendimento (Processo Técnico nº 013/2024)",
  "substancia_raw": "areia",
  "tipologia_raw": null,
  "nivel_licenciamento": null,
  "modalidade": "LAU",
  "modalidade_raw": "LAU",
  "numero_licenca": "01/2025",
  "data_concessao": "2025-02-04",
  "fonte_urls": ["https://..."],
  "trecho_citado": "Licença Ambiental Unificada Nº 01/2025, de 04 de fevereiro de 2025..."
}
```

Regra dura: **campo ausente no relatório → `null`.** Nunca inferir, nunca preencher por padrão.
O `nivel_licenciamento` do exemplo é `null` de propósito: o `trecho_citado` não menciona nível, e
o §5 regra 6 proíbe inferi-lo. Exemplo é contrato — quem escreve prompt copia daqui.

`licenciado_por_confianca` é produzido **neste nó**, não no `normalize`: é juízo sobre o texto do
relatório, e o `normalize` não recebe o relatório (§6.2).

### 6.2 Nó `normalize`

**Entrada:** `list[LicencaBruta]` + as quatro tabelas canônicas. **Não recebe o relatório.**
**Saída:** `list[LicencaNormalizada]` — cada bruta acrescida dos campos canônicos.

Política de correspondência — **atribuir o candidato mais próximo, com um piso só no município.**
Grafia divergente é resolvida ("Caetite" → "Caetité", "CIVALERG" → "Consórcio do Vale do Rio
Gavião"), mas há um caso em que forçar atribuição produz dado falso. Toda atribuição carrega:

- `municipio_match_confianca` / `consorcio_match_confianca` — float 0–1
- `municipio_match_metodo` / `consorcio_match_metodo` — `exato` · `alias` · `fuzzy` · `inferido` · `nenhum`
- o `*_raw` original, sempre preservado

**Piso de 0.60, só no município** (decisão 16). Abaixo dele: `municipio_id = null`,
`municipio_match_metodo = "nenhum"`, `municipio_raw` preservado e aviso `municipio_nao_resolvido`.
O caso concreto é a linha `Bacia do Paramirim (Região)` do teste manual (PROMPT 2, 5º lugar), que
**não é município**: forçar o candidato mais próximo gravaria uma licença sob um `codigo_ibge`
errado, e o critério de aceite 3 exige que todo `municipio_id` não-nulo esteja entre os 417 — não
que ele seja não-nulo.

**Consórcio não tem piso.** Continua sempre recebendo o mais próximo, com método e confiança
obrigatórios: errar consórcio só afeta `ranking_consorcios`, que já filtra por
`licenciado_por = "consorcio"`, enquanto o `consorcio_raw` fica preservado para conferência.

Correspondências com confiança `< 0.7` entram em `avisos[]` no manifesto do run. Assim ninguém
descobre um join errado só quando o dado já está no banco.

Pré-filtro barato antes do LLM: normalização Unicode + `rapidfuzz` contra nomes e aliases.
Acerto exato/alias resolve sem chamar o modelo; o LLM só decide os casos ambíguos.

**Cruzamento município ↔ consórcio.** O cadastro já traz `consorcio_id`/`consorcio_nome` em
cada município (§7), e o vínculo é 1:1. Isso habilita três regras — nenhuma delas rejeita
linha, todas produzem aviso:

1. **Herança quando o relatório não nomeia consórcio.** Herda-se o consórcio cadastral do
   município resolvido, com `consorcio_match_metodo: "inferido"` e
   `consorcio_match_confianca <= 0.5`. Herança é vínculo cadastral, **não** evidência de que
   o consórcio licenciou — `licenciado_por` continua governado exclusivamente pelo §6.4.
2. **Contradição.** Consórcio resolvido do relatório ≠ consórcio cadastral do município:
   prevalece o do relatório, e o run emite `consorcio_divergente`. Pode ser mudança de
   composição posterior ao snapshot do GAC ou erro do relatório; os dois merecem olho humano,
   nenhum merece descarte silencioso.
3. **Município sem consórcio.** Município entre os 27 habilitados sem vínculo consorcial,
   mas o relatório atribui um: aviso `consorcio_inesperado`.

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

Três armadilhas, todas verificadas no arquivo e a tratar no carregador:

- **Linhas de grupo.** Seis linhas não são folhas — a coluna A traz `"B1.1 Minerais metálicos"`,
  `"B1.2 Minerais Não Metálicos"` e afins. `startswith("B")` ou `re.match` engoliria as seis como
  tipologia. Filtro correto: `fullmatch` de `B\d+(?:\.\d+){1,2}` na coluna A **mais** coluna B não
  vazia — dá exatamente 17.
- **B4.2 tem `#ERROR!`** na coluna PORTE PEQUENO e o texto *"(faixa não expressa na publicação
  oficial)"* em PORTE MÉDIO. Emitir `porte_pequeno = None`, `porte_medio = None` e um aviso por
  coluna — nunca `0`. **A detecção é por sentinela de texto, não por tipo de célula:** no XLSX o
  `#ERROR!` está gravado como *shared string* (`t="s"`), não como célula de erro do Excel (`t="e"`).
  Quem testar o tipo da célula lê a string `"#ERROR!"` como porte válido e segue em frente.
  Sentinelas: `#ERROR!`, `#REF!`, `#N/A`, `#VALUE!`, `#DIV/0!`, mais o padrão
  `faixa n[ãa]o expressa`.
- **Substâncias ambíguas são dez, não uma.** Granito (B3.4 agregados/britagem vs. B3.5
  revestimento) é o caso conhecido, mas o cruzamento das 17 folhas produz dez colisões:
  `calcita` (B4.3/B4.5), `caulinita` (B4.1/B4.4), `cianita` (B2.1/B4.2), `diatomita` (B4.1/B4.5),
  `feldspato` (B4.2/B4.4), `granitos` (B3.4/B3.5), `moscovita` (B4.2/B4.4),
  `selenio` (B1.1.3/B1.2.1), `sienitos` (B3.4/B3.5), `turmalina` (B2.1/B4.2).
  O índice substância→tipologia é **muitos-para-muitos por construção** e o conjunto ambíguo é
  **derivado** dele, nunca escrito à mão. A seção de desambiguação do prompt de normalização é
  renderizada em tempo de execução a partir desse conjunto — uma frase fixa sobre Granito deixaria
  as outras nove sem instrução. Em todas: desambiguar pelo *uso* e, na dúvida, devolver `null` com
  justificativa em vez de chutar.

**Mineral:** normalizado contra os 169 valores distintos de `SUBS` em
`data_source/BA-shapefile/BA.dbf` (SIGMINE/ANM) — o mesmo vocabulário que o resto do projeto
usará no join espacial. Preserva-se sempre `substancia_raw`.

### 6.4 `licenciado_por` — gestão própria vs. consórcio

Indicador de política pública de primeira classe: mede a **capacidade institucional real** do
município. Município que licencia sozinho tem estrutura própria; município que só licencia via
consórcio depende de arranjo compartilhado. Cruzado com volume de licenças, mostra onde a
competência municipal existe de fato e onde é delegada.

```
licenciado_por ∈ { "municipio_proprio", "consorcio", "indeterminado" }
```

Discriminador é o **órgão emissor**, não o vínculo consorcial:

| Sinal no documento | Valor |
|---|---|
| Emitida por secretaria/órgão ambiental municipal; portaria assinada por autoridade do município | `municipio_proprio` |
| Emitida pelo consórcio; portaria assinada por autoridade consorcial; numeração do consórcio | `consorcio` |
| Órgão emissor não identificável na fonte | `indeterminado` |

Regra dura, e é a que mais importa: **integrar um consórcio não implica ter licenciado por meio
dele.** Municípios consorciados licenciam por conta própria com frequência. A atribuição exige
evidência textual — sem ela, `indeterminado`.

Campos correlatos, sempre presentes:

- `orgao_emissor_raw` — nome do órgão como aparece na fonte
- `licenciado_por_evidencia` — trecho que sustenta a atribuição
- `licenciado_por_confianca` — float 0–1

Consequência: `consorcio_id` pode estar preenchido com `licenciado_por = "municipio_proprio"` —
significa "município X, integrante do consórcio Y, licenciou sozinho". Combinação válida e
informativa, não erro. Validador não deve rejeitá-la.

---

## 7. Dados canônicos e o carregador com mapeamento

Os dois arquivos canônicos **já existem no repositório**, produzidos por
`scripts/collect_gac.py` a partir do GAC/SEMA-BA (ver `data/README.md`):

| Arquivo | Conteúdo |
|---|---|
| `data/processed/municipios_habilitados.json` | 417 municípios — a Bahia inteira. 367 `habilitado`/`CAPAZ`, 50 `nao_habilitado`/`NÃO CAPAZ` |
| `data/processed/consorcios.json` | 29 consórcios públicos intermunicipais, com a lista completa de membros |

⚠️ **O nome do primeiro arquivo mente:** `municipios_habilitados.json` contém **todos os 417**,
inclusive os 50 `nao_habilitado`. Habilitação se lê **só** do campo `status`; o carregador nunca a
infere do nome do arquivo nem da presença do registro.

Ambos são **dicionários indexados pelo id** (`codigo_ibge` e `consorcio_id`), não arrays, sob
uma chave-raiz. Para não acoplar o código a esse formato, o carregador lê
`research_pipeline/config/ref_mapping.yaml`:

```yaml
municipios:
  path: data/processed/municipios_habilitados.json
  root: municipios          # chave que contém os registros
  container: dict           # dict (chave = id) | list
  fields:
    id: codigo_ibge
    nome: municipio
    codigo_ibge: codigo_ibge
    consorcio_id: consorcio_id
    consorcio_nome: consorcio_nome
    nivel_habilitacao: nivel      # string "1"|"2"|"3"|null -> int|None
    situacao_gac: situacao_gac
    status: status                # habilitado | nao_habilitado
    fonte_url: fonte_url
    data_consulta: data_consulta

consorcios:
  path: data/processed/consorcios.json
  root: consorcios
  container: dict
  fields:
    id: consorcio_id
    nome: nome
    total_municipios: total_municipios
    municipios: municipios        # [{codigo_ibge, municipio, nivel, status}]
```

O carregador normaliza para um modelo interno (`Municipio`, `Consorcio`), valida na
inicialização e **falha alto** se um campo mapeado não existir — nada de descobrir isso no meio
de uma tarefa de US$ 3.

Duas coerções, porque o arquivo não traz os campos na forma que o pipeline usa:

- `nivel` vem como **string** (`"1"`/`"2"`/`"3"`), `null` quando não habilitado → `int | None`.
  Valor fora de `{"1","2","3",null}` é erro de carregamento, não valor tolerado.
- `apto_licenciar` **não existe no arquivo** — é derivado de `status == "habilitado"`.
  `situacao_gac` (`CAPAZ`/`NÃO CAPAZ`) é redundante com `status` e serve de conferência: os
  dois discordarem é falha de carregamento.

Não há fallback nem para municípios nem para consórcios: os 417 já estão no arquivo e a lista
de consórcios está completa. `data_source/Malha municipal IBGE-BA/BA_Municipios_2025.dbf`
(**UTF-8**, conforme o `.cpg` ao lado — igual a `data_source/BA-shapefile/BA.cpg`) deixa de ser
fonte alternativa e permanece apenas como conferência opcional dos `codigo_ibge`.
Ler esse DBF como Latin-1 **não levanta erro**, só corrompe em silêncio os nomes acentuados; o
comentário em `scripts/lib/municipios_ba.py:26-28` registra que isso já aconteceu neste repo.

### 7.1 Universo de municípios

**Todos os municípios baianos aptos a licenciar** — não os 10 do MVP do `BACKLOG.md`.
Os 10 permanecem como fixtures do motor de enquadramento; não limitam esta pesquisa.

Os números do cadastro atual:

| População | Total |
|---|---|
| Municípios na Bahia | 417 |
| Habilitados (`status = habilitado`, `situacao_gac = CAPAZ`) | 367 |
| Não habilitados | 50 |
| Vinculados a consórcio | 386 |
| Sem consórcio | 31 — dos quais **27 habilitados** |

Os **27 habilitados sem consórcio** são a população pura `municipio_proprio`: licenciam por
estrutura própria, sem arranjo compartilhado disponível.

O vínculo é **1:1** — nenhum município integra dois consórcios. Corrige a suposição da v1.2 de
que as duas populações se sobrepõem: no snapshot atual **não se sobrepõem**, todo habilitado
está em exatamente um consórcio ou em nenhum. O §6.4 continua valendo por outro motivo — o que
decide `licenciado_por` é o órgão emissor, e município consorciado licencia por conta própria
com frequência.

**O universo não é injetado no prompt de pesquisa.** Pergunta vai em aberto — "municípios da
Bahia" — e a pesquisa devolve quem de fato licenciou. Listas canônicas atuam **só depois**, no
nó `normalize` (§6.2), para amarrar os nomes encontrados aos ids do banco.

`apto_licenciar` (derivado, §7) e `nivel_habilitacao` enriquecem a saída e sinalizam no
manifesto quando a pesquisa atribuir licença a município marcado como não apto — divergência
que merece olho humano. Nunca filtram a pesquisa.

### 7.2 Aliases derivados

**Nenhum dos dois arquivos traz `aliases`, e `consorcios.json` não traz `sigla`.** O casamento
do §6.2 depende de gerá-los. As regras são mecânicas — nada de curadoria escondida no código:

- **Município:** dobra Unicode NFKD sem acento, minúsculo, sem hífen nem apóstrofo
  (`Dias d'Ávila` → `dias davila`, `Xique-Xique` → `xique xique`). Entre os 417 nomes dobrados
  **não há colisão**, então a dobra sozinha é chave única.
- **Consórcio:** a dobra resolve `CONSORCIO` ↔ `CONSÓRCIO` — os nomes vêm em caixa alta e **sem
  acento em "CONSORCIO"**, enquanto relatórios escrevem `Consórcio`. Sem isso, o match exato dos 29
  cairia por inteiro.

**Sigla (14 dos 29).** Segmento final após `" - "`, `" – "` ou `" \x96 "`, **e só quando esse
segmento é um único token em caixa alta**. Senão, `sigla = None`.

O separador do CISUDOESTE **não é espaço duplo**: é o byte `\x96` — en-dash mojibake de cp1252 —
em `'CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \x96 CISUDOESTE'` (id `45429`). E a regra
descartada "último token em caixa alta quando não houver traço" produzia sigla-lixo em 15 dos 29
(`SERTÃO`, `PARAGUAÇU`, `DIAMANTINA`, `CHICO`, `IRECÊ`…), porque **o nome inteiro** é caixa alta.

As 14 com sigla: COTEMESB, CONDESC, CONSTRUIR, CTR, CIVALERG, CIBARC, CONSTESF, CISAN,
CISUDOESTE, CIAPRA, CIMURC, CONSID, CIMA, CONSISAL. As outras 15 não têm sigla, e `None` é a
resposta correta.

**Chave curta.** Um regex literal único não serve: falha em ≥6 dos 29 nomes reais —
`CONSORCIO DE DESENVOLVIMENTO SUSTENTAVEL DO TERRITÓRIO LITORAL SUL` (id `11666`, onde a **fonte**
perde o acento em `SUSTENTAVEL` também), `CONSORCIO INTERMUNICIPAL SOMAR`,
`CONSORCIO DO TERRITÓRIO DO RECÔNCAVO`, `CONSORCIO SUSTENTÁVEL TERRITÓRIO DO SÃO FRANCISCO`,
`CONSORCIO PUBLICO INTERMUNICIPAL DE INFRA ESTRUTURA DO EXTREMO SUL DA BAHIA` e
`CONSORCIO DE DESENVOLVIMENTO SUSTENTÁVEL DO CIRCUITO DO DIAMANTE…` (sem `TERRITÓRIO`).

Em vez dele, **cascata ordenada de grupos de token opcionais, aplicada depois da dobra** — a dobra
já colapsou `SUSTENTAVEL`/`SUSTENTÁVEL`, então a cascata não precisa de variante acentuada:
`consorcio`, `publico|interfederativo`, `intermunicipal`, `de desenvolvimento sustentavel`,
`sustentavel`, `de infra ?estrutura`, `do territorio`, `de identidade`, `de`, `do`, mais sufixo
opcional `da bahia|baiano`. Resultado: `…DO TERRITÓRIO DO SISAL - CONSISAL` → `sisal`,
`…DO TERRITÓRIO PORTAL DO SERTÃO` → `portal do sertao`,
`…INTERMUNICIPAL BACIA DO RIO CORRENTE - CIBARC` → `bacia do rio corrente`.

Casos que regra mecânica não alcança vão para um override versionado em
`research_pipeline/config/aliases.yaml` — hoje um só: `SANTA TERESINHA` (GAC) ↔ `Santa Terezinha`
(IBGE, `codigo_ibge` 2928505), já tratado em `scripts/lib/municipios_ba.py:ALIASES`.

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
    "refs_data_consulta": "2026-08-01",
    "total_licencas": 8,
    "total_por_licenciado_por": {
      "municipio_proprio": 3,
      "consorcio": 4,
      "indeterminado": 1
    },
    "municipios_com_licenca": 6,
    "avisos": ["consorcio_match_confianca < 0.7 em 1 registro"]
  },
  "licencas": [
    {
      "id": "2025-caturama-lau-01",
      "municipio_id": "2907558",
      "municipio_nome": "Caturama",
      "municipio_raw": "Caturama",
      "municipio_match_metodo": "exato",
      "municipio_match_confianca": 1.0,
      "consorcio_id": "14618",
      "consorcio_nome": "CONSORCIO PÚBLICO DE DESENVOLVIMENTO SUSTENTÁVEL DO TERRITÓRIO BACIA DO PARAMIRIM",
      "consorcio_raw": "Consórcio Bacia do Paramirim",
      "consorcio_match_metodo": "alias",
      "consorcio_match_confianca": 0.92,
      "licenciado_por": "consorcio",
      "orgao_emissor_raw": "Consórcio Público Interfederativo da Bacia do Paramirim",
      "licenciado_por_evidencia": "Licença assinada pelo Diretor Técnico do Consórcio...",
      "licenciado_por_confianca": 0.95,
      "titular": "Empreendimento (Processo Técnico nº 013/2024)",
      "mineral": "AREIA",
      "substancia_raw": "areia",
      "tipologia_codigo": "B3.1",
      "tipologia_nome": "Areias, Arenoso, Cascalhos, Filitos e Saibro",
      "potencial_poluidor": "M",
      "nivel_licenciamento": null,
      "modalidade": "LAU",
      "modalidade_raw": "LAU",
      "numero_licenca": "01/2025",
      "data_concessao": "2025-02-04",
      "fonte_urls": ["https://..."],
      "trecho_citado": "Licença Ambiental Unificada Nº 01/2025...",
      "data_consulta": "2026-08-01",
      "verificado": false
    }
  ],
  "ranking_municipios": [
    { "posicao": 1, "municipio_id": "2907558", "municipio_nome": "Caturama",
      "consorcio_nome": "CONSORCIO PÚBLICO DE DESENVOLVIMENTO SUSTENTÁVEL DO TERRITÓRIO BACIA DO PARAMIRIM",
      "total_licencas": 2,
      "licencas_gestao_propria": 0,
      "licencas_via_consorcio": 2,
      "licencas_indeterminado": 0,
      "modo_predominante": "consorcio" }
  ],
  "ranking_consorcios": [
    { "posicao": 1, "consorcio_id": "14618", "total_licencas": 2,
      "municipios_atendidos": 1 }
  ]
}
```

`ranking_consorcios` conta **só** `licenciado_por = "consorcio"` — senão infla o consórcio com
licenças que o município emitiu sozinho. `ranking_municipios` conta tudo, discriminado por modo.

O `nivel_licenciamento` do exemplo é `null` pelo mesmo motivo do §6.1, e a coerência entre os dois
não é cosmética: `normalize` não vê o relatório, logo **não pode preencher um nível que `extract`
devolveu `null`**. Nível só chega ao produto final se estiver no documento citado.

`verificado: false` é sempre a saída do pipeline — atende à exigência do backlog
(*"cada linha da base tem procedência"*) sem fingir uma verificação humana que não houve.

**Ranking sem posição repetida** (decisão 17). Ordenação `(-total_licencas, fold(nome), id)` e
`posicao = 1, 2, 3…` sempre única. Dar a mesma posição a empatados **e** desempatá-los por nome são
coisas incompatíveis; a escolha é posição única, e o empate fica visível em `total_licencas`.
O `id` no fim da chave de ordenação garante estabilidade mesmo no caso improvável de nome dobrado
repetido.

**`data_consulta` é a data do run**, não a do cadastro. É quando *esta* pesquisa foi feita — a
procedência que o backlog exige. O snapshot do GAC de onde vêm os dois JSONs canônicos
(`2026-08-01`) é outra coisa e vai em `meta.refs_data_consulta`, propagado dos arquivos (§11).

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

Duas formas de não repagar a pesquisa, e são flags distintas:

- **`--resume <run_id>`** — retoma um run existente do checkpoint. Se a tarefa de Deep Research
  estava em polling, refaz o polling do mesmo `interaction_id`.
- **`--report PATH`** — injeta um relatório já salvo e **pula o nó `deep_research` por inteiro**,
  em qualquer run novo. É o que permite iterar de graça nos prompts do DeepSeek sobre um relatório
  real, e é o que torna todo o caminho `extract → normalize → validate → rank_and_emit`
  verificável sem chave nem gasto.

---

## 10. Stack

| Camada | Escolha |
|---|---|
| Orquestração | `langgraph` + `langchain-core` |
| Pesquisa | `google-genai` (Deep Research Interactions API) |
| Estruturação | `langchain-openai` apontando para o endpoint compatível da DeepSeek |
| Schemas | `pydantic` v2 |
| Fuzzy match | `rapidfuzz` |
| Leitura de referências | `openpyxl` (XLSX), `PyYAML`; DBF pelo leitor próprio (decisão 19) |
| Checkpoint | `langgraph-checkpoint-sqlite` |
| Config | `.env` → `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` |

`requirements.txt` **já existe** e hoje declara as dependências dos scripts de coleta
(`requests`, `beautifulsoup4`, `lxml`, `pdfplumber`), invocado pelo `postCreateCommand` do
`devcontainer.json`. As dependências do pipeline são **acrescentadas** a ele — não é arquivo
novo, e o bloco de coleta não sai.

`dbfread` **não entra** (decisão 19): o leitor DBF de `scripts/lib/municipios_ba.py:_read_dbf` — 35
linhas de `struct` — já lê os dois arquivos que o pipeline precisa, inclusive
`data_source/BA-shapefile/BA.dbf` (31.858 registros, 12 colunas). Ele é copiado para `common/dbf.py`
em vez de importado: `scripts/` não é pacote, e acoplar o produto a um script de coleta pontual é
pior que duplicar 35 linhas com teste de paridade.

Estrutura de código prevista:

```
common/                        compartilhado com scripts/, sem acoplar
├── __init__.py
├── text.py                    fold() — dobra Unicode (§7.2)
├── dbf.py                     read_dbf()
└── tests/test_text_parity.py  trava a paridade com scripts/lib/municipios_ba.py

research_pipeline/
├── __init__.py
├── GOAL.md                    ← este documento
├── IMPLEMENTATION_PLAN.md     plano incremental por patches
├── gemini_deep_research_test.md
├── README.md
├── prompts/
│   ├── deep_research_v1.md
│   ├── extract_v1.md
│   └── normalize_v1.md
├── config/
│   ├── ref_mapping.yaml
│   ├── aliases.yaml           overrides (§7.2)
│   └── matching.yaml          pisos e limiares de confiança (§6.2)
├── schemas.py                 Pydantic: Citation, LicencaBruta, LicencaNormalizada, Produto…
├── refs.py                    carregador com mapeamento + invariantes (AC 8)
├── vocab.py                   tipologias (XLSX) + minerais (SIGMINE)
├── aliases.py                 derivação mecânica (§7.2)
├── matcher.py                 pré-filtro determinístico rapidfuzz
├── llm.py                     interface do estruturador + fixtures
├── research.py                interface Deep Research
├── nodes/
│   ├── __init__.py
│   └── {research,extract,normalize,validate,emit}.py
├── graph.py
├── run.py                     CLI
├── tools/check_golden.py      diff de nó contra golden, sem chave
├── tests/                     pytest nas partes puras + fixtures/
└── runs/                      artefatos por run (gitignored)
```

---

## 11. Riscos assumidos

| Risco | Mitigação |
|---|---|
| Cadastro município↔consórcio é um **snapshot datado** do GAC (`2026-08-01`); composição de consórcio muda | `data_consulta` propagada do arquivo para o manifesto. Divergência entre relatório e cadastro vira aviso `consorcio_divergente` (§6.2), nunca rejeição de linha. |
| Arquivos canônicos não trazem `aliases` nem `sigla` — casamento depende de derivá-los | Derivação mecânica e documentada (§7.2) mais override versionado em `config/aliases.yaml`. Sem isso, `CONSORCIO` vs. `Consórcio` já derrubaria o match exato de todos os 29. |
| `nivel` vem como string e `apto_licenciar` não existe no arquivo | Coerção explícita no carregador (§7), com falha alta para valor fora de `{"1","2","3",null}` e para desacordo entre `status` e `situacao_gac`. |
| "Sempre atribuir o mais próximo" pode gerar joins errados no banco | Piso de `0.60` no município: abaixo dele, `municipio_id = null` + `municipio_nao_resolvido` (§6.2), o que barra o caso real `Bacia do Paramirim (Região)`. Consórcio sem piso, porque só afeta `ranking_consorcios`. Em toda linha: `*_raw` preservado, método e confiança; confiança `< 0.7` promovida a aviso no manifesto. |
| Nome de arquivo `municipios_habilitados.json` sugere subconjunto, mas contém os 417 | Habilitação lida só de `status` (§7); invariante de contagem 417 no carregador falha alto se alguém trocar o arquivo por um subconjunto de verdade. |
| Deep Research pode alucinar licenças plausíveis | `fonte_url` + `trecho_citado` obrigatórios; sem fonte a linha não entra. `verificado: false` sempre. |
| Cobertura variável entre execuções | Aceito por decisão de escopo. Travamos a forma, não os achados. O `run_id` mantém cada resultado auditável. |
| `nivel_licenciamento` uniforme (todos "Nível 3" no teste manual) sugere preenchimento por padrão | Prompt proíbe inferência; sem documento, `null`. Um alerta é emitido se >90% das linhas tiverem o mesmo nível. |
| API Deep Research em *preview* | ID do modelo fixado no manifesto; a camada de pesquisa fica atrás de uma interface para permitir troca. |
| Municípios do teste (Caturama, Tremedal, Pintadas…) não intersectam os 10 do BACKLOG | Resolvido: escopo é **todos** os municípios aptos (§7.1). Os 10 são fixtures do motor, não recorte da pesquisa. |
| Pergunta em aberto ("municípios da Bahia") pode render cobertura rasa | Aceito: enumerar 417 nomes no prompt enviesaria o agente a preencher linhas por nome reconhecido. Prompt prioriza fontes agregadoras (consórcios, CEPRAM/INEMA, TCM-BA). `municipios_com_licenca` no manifesto expõe cobertura real; queda brusca entre execuções vira aviso. Se ficar raso, fan-out por consórcio (custo × N). |
| Consórcio creditado por licença que o município emitiu sozinho | `licenciado_por` exige evidência textual; `ranking_consorcios` conta só `"consorcio"`. Sem evidência, `indeterminado` — nunca deduzido do vínculo consorcial. |

---

## 12. Decisões travadas

| # | Decisão |
|---|---|
| 1 | Deep Research via API oficial (`deep-research-preview-04-2026`), assíncrona com polling. |
| 2 | Uma execução = um ano, toda a Bahia. Uma única tarefa de pesquisa por run. |
| 3 | Referências vêm de `data/processed/municipios_habilitados.json` (417) e `data/processed/consorcios.json` (29), geradas por `scripts/collect_gac.py`. Lidas via `ref_mapping.yaml`, que **mantém o mapeamento completo de campos** e ganha `container: dict \| list`. |
| 4 | Normalização atribui o candidato mais próximo, com método + confiança obrigatórios — **com a exceção da decisão 16**: município abaixo do piso de `0.60` fica `null`. |
| 5 | Procedência obrigatória: `fonte_urls`, `trecho_citado`, `data_consulta`, `verificado: false`. |
| 6 | Grão do JSON: uma licença concedida por registro; ranking derivado em Python. |
| 7 | `tipologia` restrita ao vocabulário fechado do Anexo IV; `mineral` ao vocabulário SIGMINE. |
| 8 | Determinismo por prompt versionado + `temperature=0` + schema + até 2 reparos. |
| 9 | Dois agentes DeepSeek `deepseek-v4-flash`: `extract` e `normalize`, com entradas disjuntas. |
| 10 | `SqliteSaver` + artefatos por run em `research_pipeline/runs/<run_id>/`. |
| 11 | `licenciado_por` (`municipio_proprio` / `consorcio` / `indeterminado`) é campo obrigatório, com órgão emissor, evidência e confiança. Nunca deduzido do vínculo consorcial. |
| 12 | Universo = todos os municípios baianos aptos a licenciar, não os 10 do MVP do backlog. |
| 13 | Prompt de pesquisa pergunta em aberto por "municípios da Bahia" — sem lista de municípios ou consórcios. Rígido no prompt é o **formato de saída**. Listas canônicas só no nó `normalize`. |
| 14 | Aliases e siglas são **derivados mecanicamente** (§7.2), com override versionado em `config/aliases.yaml`. Os arquivos canônicos não os trazem. |
| 15 | Consórcio cadastral do município é herdado como `inferido` (confiança `<= 0.5`) quando o relatório cala; divergência entre relatório e cadastro vira aviso, nunca rejeição. Herança **não** define `licenciado_por` — isso continua sendo decisão do órgão emissor (§6.4). |
| 16 | **Piso de fuzzy só no município** (`0.60`): abaixo dele, `municipio_id = null`, método `nenhum`, aviso `municipio_nao_resolvido`. Consórcio não tem piso. O critério de aceite 3 exige `municipio_id` **válido**, não `municipio_id` preenchido (§6.2). |
| 17 | **Ranking sem posição repetida:** ordenação `(-total_licencas, fold(nome), id)`, `posicao = 1,2,3…`. O empate fica visível em `total_licencas` (§8). |
| 18 | `refs` **não entra no estado checkpointado** — trafega em `config["configurable"]["refs"]`, para o `SqliteSaver` não regravar 417+29 objetos por passo (§3). |
| 19 | `dbfread` **fora do stack**: o leitor DBF próprio (`scripts/lib/municipios_ba.py:_read_dbf`, copiado para `common/dbf.py` com teste de paridade) já lê os dois arquivos necessários (§10). |
