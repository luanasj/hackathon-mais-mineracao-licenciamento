# Plano de implementação — `research_pipeline`

> **15 patches (0–14).** Derivado de `research_pipeline/GOAL.md` v1.3.
> **Branch:** `feature/deep-research-pipeline` · **Escrito em:** 2026-08-01
> Patches 0–12 verificáveis com **custo zero**. Patch 13 ~US$ 0,01. Patch 14 US$ 1–3.

## Contexto

`research_pipeline/GOAL.md` (v1.3) define o escopo travado de um pipeline LangGraph que
transforma o teste manual do Gemini Deep Research em um produto de dados reprodutível: um JSON
onde cada registro é **uma licença ambiental de mineração concedida por um município baiano**,
com `municipio`/`consorcio` normalizados contra as tabelas canônicas, `tipologia` no vocabulário
fechado do Anexo IV, e procedência obrigatória.

Hoje `research_pipeline/` contém **só** `GOAL.md` e `gemini_deep_research_test.md` — zero código.
Nenhuma dependência do §10 está instalada (`pydantic`, `langgraph`, `openpyxl`, `rapidfuzz`
todas ausentes; PyPI acessível, HTTP 200). Não existe `tests/`, `pytest.ini`, `.env.example`,
nem `pyproject.toml`. `.gitignore` **não ignora `.env`** — risco de vazamento hoje.

O plano abaixo quebra isso em patches ordenados. Cada patch é um commit independente,
revisável e verificável. **Os patches 0–12 são verificáveis com custo zero** — nenhuma
chave de API, nenhuma chamada paga. O primeiro centavo só sai no patch 13 (~US$ 0,01) e os
US$ 1–3 só no patch 14, depois de a retomada já estar provada offline.

## Decisões desta sessão

| # | Decisão |
|---|---|
| A | **Patch 0 corrige o GOAL.md** para v1.4. Documento e código nunca divergem. |
| B | Fixture de relatório é **escrita à mão** no formato do §5, com casos de borda semeados. Custo zero, determinística. |
| C | Código compartilhado vai para um pacote `common/` novo. **`scripts/lib/municipios_ba.py` não é tocado** — código que já funciona fica intacto; um teste de paridade impede deriva. |
| D | **pytest só nas partes puras** (loader, vocabulário, aliases, matcher, validação, ranking). Nós de LLM verificados por fixture + CLI com diff contra golden. |
| E | **Piso de fuzzy só no município** (`< 0.60` → `municipio_id = null` + aviso). Consórcio sempre recebe o candidato mais próximo, porque errar consórcio só afeta `ranking_consorcios`, que já filtra por `licenciado_por`. |
| F | **Ranking sem posição repetida**: ordenação `(-total_licencas, fold(nome), id)`, `posicao = 1,2,3…` sempre. O empate fica visível em `total_licencas`. |
| G | `refs` **não entra** no estado checkpointado (`SqliteSaver` serializaria 417+29 objetos por checkpoint). Vai em `config["configurable"]["refs"]`. |
| H | `dbfread` **sai** do stack do §10 — o leitor DBF em `scripts/lib/municipios_ba.py:_read_dbf` já lê os dois arquivos (verificado: `BA.dbf` = 31.858 registros, 12 colunas). |

---

## Patch 0 — Corrigir GOAL.md para v1.4

**Objetivo:** eliminar os erros factuais antes que alguém implemente contra eles.

**Arquivo:** `research_pipeline/GOAL.md`.

Correções verificadas contra os arquivos reais:

1. **§7** — *"`BA_Municipios_2025.dbf` (**Latin-1**, conforme o `.cpg`)"* é falso: os dois `.cpg`
   (`Malha municipal IBGE-BA/BA_Municipios_2025.cpg` e `BA-shapefile/BA.cpg`) contêm `UTF-8`.
   `scripts/lib/municipios_ba.py:26-28` já documenta que latin-1 corrompeu nomes acentuados aqui.
2. **§4** — `visualization="none"` não é valor válido. A doc oficial aceita `"auto" | "off"` → usar `"off"`.
   Corrigir também a forma da chamada: os flags vão dentro de
   `agent_config={"type": "deep-research", ...}`, não como kwargs soltos.
3. **§6.3, armadilha B4.2** — `#ERROR!` está gravado como **shared string** (`t="s"`), não como
   célula de erro do Excel (`t="e"`). Detecção por tipo de célula erra silenciosamente.
   Detectar por sentinela de texto.
4. **§6.3, armadilha do Granito** — Granito não é o único caso ambíguo. Colisões medidas nas 17
   folhas: `calcita` (B4.3/B4.5), `caulinita` (B4.1/B4.4), `cianita` (B2.1/B4.2), `diatomita`
   (B4.1/B4.5), `feldspato` (B4.2/B4.4), `granitos` (B3.4/B3.5), `moscovita` (B4.2/B4.4),
   `selenio` (B1.1.3/B1.2.1), `sienitos` (B3.4/B3.5), `turmalina` (B2.1/B4.2) — **dez**.
   O prompt de normalização deve ser gerado a partir do conjunto derivado, não com uma frase
   fixa sobre Granito.
5. **§7.2, sigla** — "último token em caixa alta quando não houver traço" produz siglas-lixo
   (`SERTÃO`, `PARAGUAÇU`, `SUL`, `CHICO`, `IRECÊ`) em 15 dos 29. E **CISUDOESTE não é separado
   por espaço duplo**: o separador real é o byte `\x96` (en-dash mojibake de cp1252) em
   `'CONSORCIO INTERMUNICIPAL DO SUDOESTE DA BAHIA \x96 CISUDOESTE'`.
   Regra correta: segmento final após `" - "`, `" – "` ou `" \x96 "`, e só se for um único token
   em caixa alta → 14 siglas, CISUDOESTE incluída.
6. **§7.2, prefixo genérico** — o regex literal único falha em ≥6 dos 29 nomes reais, incluindo
   `CONSORCIO DE DESENVOLVIMENTO SUSTENTAVEL DO TERRITÓRIO LITORAL SUL` (id `11666` — a
   **fonte** também perde o acento em `SUSTENTAVEL`, não só em `CONSORCIO`),
   `CONSORCIO INTERMUNICIPAL SOMAR`, `CONSORCIO DO TERRITÓRIO DO RECÔNCAVO`,
   `CONSORCIO SUSTENTÁVEL TERRITÓRIO DO SÃO FRANCISCO`. Trocar por cascata de tokens opcionais.
7. **§6.2 + decisão 4 vs. AC3** — registrar a decisão E: piso `0.60` só no município.
8. **§8, empates** — registrar a decisão F: posição única, desempate por nome.
9. **§6.1, exemplo de `LicencaBruta`** — traz `nivel_licenciamento: 3` numa linha cujo trecho
   citado não menciona nível, contrariando o §5 regra 6. Trocar para `null` (autores de prompt
   copiam exemplos). Acrescentar `licenciado_por_confianca` ao exemplo — o §6.4 diz que é sempre
   presente e define-se aqui que quem o produz é o nó `extract`, porque é juízo sobre o texto do
   relatório e `normalize` não vê o relatório.
10. **§3 `PipelineState`** — `Citation` é referenciado e nunca definido; `refs` sai do estado
    (decisão G); acrescentar `run_id` e `avisos`, exigidos pelo §8/§9.
11. **§9/§10** — acrescentar a flag `--report PATH` (o §9 promete "relatório salvo pula o nó
    deep_research" mas só define `--resume`); acrescentar `__init__.py` e local de testes à
    árvore do §10; remover `dbfread` do stack (decisão H).
12. **§8, `data_consulta` por licença** — ambíguo hoje. Fixar: é a data do run.
    O snapshot do GAC (`2026-08-01`) vai em `meta.refs_data_consulta`.
13. Nota de nomenclatura: `municipios_habilitados.json` contém **todos os 417**, inclusive os 50
    `nao_habilitado`. O carregador nunca deve inferir habilitação do nome do arquivo.

**Verificar:** revisão humana do diff. Nenhum código muda.

---

## Patch 1 — Andaime: dependências, pacotes, `.env`, pytest

**Objetivo:** fazer `python -m research_pipeline...` e `pytest` funcionarem, com segredo tratado
antes de existir chave.

**Arquivos**
- **modificar** `requirements.txt` — acrescentar bloco do pipeline abaixo do bloco de coleta (que
  fica, §10): `langgraph`, `langgraph-checkpoint-sqlite`, `langchain-core`, `langchain-openai`,
  `google-genai`, `pydantic>=2.7,<3`, `rapidfuzz`, `openpyxl`, `PyYAML`, `python-dotenv`,
  `pytest`. Sem `dbfread`. `PyYAML` hoje é usado implicitamente e não é declarado — declarar.
- **modificar** `.gitignore` — acrescentar `.env`, `.env.local`, `research_pipeline/runs/`,
  `.pytest_cache/`. Hoje só ignora `__pycache__/ *.pyc node_modules/ dist/ .DS_Store`.
- **criar** `.env.example` — `GEMINI_API_KEY=`, `DEEPSEEK_API_KEY=`, `RP_LLM=fixture`, `RP_RESEARCH=none`.
- **criar** `pytest.ini` — `testpaths = research_pipeline/tests common/tests`, `addopts = -q`.
  `pytest.ini` e não `pyproject.toml`: o repo não tem build backend, `requirements.txt` é o contrato.
- **criar** `research_pipeline/__init__.py` (com `REPO_ROOT = Path(__file__).resolve().parents[1]`),
  `research_pipeline/nodes/__init__.py`, `research_pipeline/tests/__init__.py`.
- **criar** `common/__init__.py`, `common/tests/__init__.py`.

**Verificar:** `pip install -r requirements.txt && python -c "import langgraph, pydantic, openpyxl, rapidfuzz, yaml"` sem erro; `python -m pytest` colhe 0 testes e sai 5 (ou 0 após o patch 2).

**Não faz ainda:** nenhuma lógica.

---

## Patch 2 — `common/`: dobra de texto e leitor DBF

**Objetivo:** pacote compartilhado importável, sem tocar em `scripts/`.

**Arquivos**
- **criar** `common/text.py` — `fold(text) -> str`: NFKD → remove combinantes → apóstrofos
  (`' ‘ ’ \``) **e hífens** → espaço → minúsculo → colapsa espaços. Docstring aponta a origem
  (`scripts/lib/municipios_ba.py:_normalize`) e a única divergência intencional: aquele não dobra
  hífen, este dobra (§7.2 exige).
- **criar** `common/dbf.py` — `read_dbf(path, encoding="utf-8")`, cópia do `_read_dbf` original.
  Docstring registra por que existe cópia em vez de import: `scripts/` não tem `__init__.py` e
  usa `sys.path` hack; acoplar um script de coleta pontual ao produto de longa vida é pior que
  35 linhas duplicadas.
- **criar** `common/tests/test_text_parity.py` — carrega `scripts/lib/municipios_ba.py` via
  `importlib.util.spec_from_file_location` e afirma `fold(n) == _normalize(n)` para os 417 nomes,
  **exceto** `Xique-Xique`, onde deve divergir. Trava a divergência para que uma mudança futura
  em qualquer lado quebre alto.

**Verificar:** `python -m pytest common/tests` → passa. Fatos já medidos que os testes fixam:
`fold("Dias d'Ávila") == "dias davila"`, `fold("Xique-Xique") == "xique xique"`, **zero colisões**
de nome dobrado entre os 417.

---

## Patch 3 — Carregador de referências + invariantes (AC8)

**Objetivo:** satisfazer o critério de aceite 8 por completo e falhar alto antes de qualquer gasto.

**Arquivos**
- **criar** `research_pipeline/config/ref_mapping.yaml` — o mapeamento do §7, mais bloco
  `invariantes:` (`municipios_esperados: 417`, `consorcios_esperados: 29`, `soma_total_municipios: 386`).
  Números viram config auditável em vez de constante mágica em três arquivos.
- **criar** `research_pipeline/refs.py`
  - `class RefLoadError(Exception)`
  - `Municipio(id, nome, codigo_ibge, consorcio_id|None, consorcio_nome|None, nivel_habilitacao: int|None, situacao_gac, status, apto_licenciar: bool, fonte_url, data_consulta)` — frozen dataclass
  - `Consorcio(id, nome, total_municipios: int, membros: tuple[str, ...])`
  - `ReferenceData(municipios, consorcios, tipologias, minerais, data_consulta, fonte_urls, avisos)` — `tipologias`/`minerais` vazios neste patch
  - `load_reference_data(mapping_path=..., root=REPO_ROOT) -> ReferenceData`
  - `_load_table(spec, root)` tratando `container: dict | list`; campo mapeado ausente levanta
    `RefLoadError` nomeando arquivo, campo e id do registro
  - `_coerce_nivel(v)` aceita só `{"1","2","3",None}`; qualquer outro é `RefLoadError` (§7)
  - `apto_licenciar` derivado de `status == "habilitado"`; discordância com `situacao_gac` é `RefLoadError`
  - `_check_invariants`: 417 / 29 / `sum(total_municipios) == 386` / membros distintos == 386 /
    membros ⊆ chaves / `status`↔`situacao_gac` nos 417 / consistência reversa
    (`municipios[m].consorcio_id == consorcio.id` em toda linha de membro)
  - `if __name__ == "__main__":` imprime resumo, na convenção de `municipios_ba.py`
- **criar** `research_pipeline/tests/test_refs.py` — o teste do AC8; contagem dos 27 habilitados
  sem consórcio; histograma de `nivel` `{3: 333, 2: 28, 1: 6, None: 50}`; e testes **negativos**
  que copiam o JSON para `tmp_path`, corrompem um campo/contagem e exigem `RefLoadError`.

**Verificar:**
```
python -m research_pipeline.refs
```
esperado: `417 municípios (367 aptos / 50 não aptos)`, `29 consórcios (soma=386, membros distintos=386)`,
`data_consulta: 2026-08-01`, `invariantes: OK`. Mais `python -m pytest research_pipeline/tests/test_refs.py`.

Todos esses números já foram conferidos contra os arquivos reais, inclusive os dois que o GOAL.md
não afirma: `status`↔`situacao_gac` nunca discordam, e `consorcio_nome` é idêntico entre os dois
arquivos nos 386 vínculos (0 divergências).

**Não faz ainda:** nada de XLSX, DBF, matching ou aliases.

---

## Patch 4 — Vocabulários: tipologias (XLSX) + minerais (DBF), com as duas armadilhas

**Objetivo:** carregar as 17 folhas do vocabulário fechado e os 169 `SUBS` do SIGMINE, tratando
toda célula malformada explicitamente.

**Arquivos**
- **criar** `research_pipeline/vocab.py`
  - `LEAF_CODE_RE = re.compile(r"B\d+(?:\.\d+){1,2}")` usado com `.fullmatch()` na coluna A.
    **Isso é carga estrutural:** a planilha tem linhas de grupo cuja coluna A é
    `"B1.1 Minerais metálicos"` e `"B1.2 Minerais Não Metálicos"` — `match()`/`startswith()`
    engoliria as duas como folha. Fullmatch + coluna B não vazia dá exatamente 17.
  - `SENTINELAS_ERRO = {"#ERROR!", "#REF!", "#N/A", "#VALUE!", "#DIV/0!"}` e
    `SENTINELA_TEXTO_RE = re.compile(r"faixa n[ãa]o expressa")`. B4.2 → `porte_pequeno = None`,
    `porte_medio = None`, dois avisos (`tipologia_porte_ausente:B4.2:porte_pequeno` e
    `:porte_medio`). **Nunca `0`.**
  - `Tipologia(codigo, nome, unidade_porte, porte_pequeno|None, porte_medio|None, porte_grande|None,
    potencial_poluidor: Literal["P","M","A"], classe_pequeno, classe_medio, classe_grande,
    substancias: tuple[str,...], uso: str|None)` — a planilha tem mais colunas do que o §6.3
    mostra (`UNIDADE DE MEDIDA DE PORTE`, `CLASSE (Pequeno/Médio/Grande)`); aproveitar todas.
  - `load_tipologias(path)` → exige exatamente 17 códigos, iguais ao conjunto do §6.3; divergência
    é `RefLoadError`.
  - `split_substancias(nome)` — quebra em `,` e ` e `, descarta as caudas genéricas
    (`Dentre Outras Utilizadas Para…`, `e outras`, `Para Manufatura de…`, `etc.`), dobra cada uma.
  - `build_substancia_index(tipologias) -> dict[str, tuple[str, ...]]` — muitos-para-muitos por
    construção; `SUBSTANCIAS_AMBIGUAS` é **derivado**, nunca escrito à mão.
  - `MATRIZ_PORTE_PP` da aba 2 (`Porte × P/M/A → Classe 1..6`), usada só para conferir as colunas
    `CLASSE (…)`; discordância é aviso.
- **criar** `research_pipeline/tests/test_vocab.py`
- **modificar** `research_pipeline/refs.py` — ligar `tipologias`/`minerais` ao `ReferenceData` e
  propagar os avisos do vocabulário.
- **modificar** `research_pipeline/config/ref_mapping.yaml` — blocos `tipologias:`
  (aba `Divisão B - Mineração`) e `minerais:` (`BA-shapefile/BA.dbf`, coluna `SUBS`, `utf-8`).

**Verificar:** `python -m pytest research_pipeline/tests/test_vocab.py`, afirmando:
17 tipologias e as 6 linhas de grupo excluídas; `tipologias["B4.2"].porte_pequeno is None` com os
2 avisos; `indice["granitos"] == ("B3.4", "B3.5")`; `SUBSTANCIAS_AMBIGUAS` igual às **10** colisões
medidas (snapshot congelado, para que mudança de vocabulário quebre alto); `len(minerais) == 169`;
`read_dbf` devolve 31.858 linhas e as 12 colunas esperadas.

**Não faz ainda:** nenhuma *resolução* substância→tipologia (patch 9). Aqui só se constrói o índice
e se prova que as armadilhas estão tratadas.

---

## Patch 5 — Derivação mecânica de aliases

**Objetivo:** a camada que faz `CONSORCIO` casar com `Consórcio`, como funções puras sem I/O.

**Arquivos**
- **criar** `research_pipeline/aliases.py`
  - `derive_municipio_aliases(nome) -> frozenset[str]` — `{fold(nome)}` mais variante sem
    `d'`/`de`/`do`.
  - `SEPARADOR_SIGLA = re.compile(r"\s+[-–]\s+")` — inclui `\x96`, o separador real do
    CISUDOESTE.
  - `PREFIXOS_GENERICOS` — cascata ordenada de grupos de token opcionais, aplicada **depois** da
    dobra: `consorcio`, `publico|interfederativo`, `intermunicipal`, `de desenvolvimento sustentavel`,
    `sustentavel`, `de infra ?estrutura`, `do territorio`, `de identidade`, `de`, `do`, mais sufixo
    opcional `da bahia|baiano`.
  - `ConsorcioAliases(folded, sigla: str|None, chave_curta: str|None, tokens: frozenset[str])`
  - `derive_consorcio_aliases(nome) -> ConsorcioAliases` — sigla só se o segmento após o separador
    for **um** token em caixa alta; senão `None`.
  - `load_overrides(path) -> AliasOverrides`
- **criar** `research_pipeline/config/aliases.yaml` — esquema documentado
  `municipios: {<codigo_ibge>: [alias, ...]}` /
  `consorcios: {<consorcio_id>: {sigla: str|null, aliases: [...]}}`, semeado com o único override
  real conhecido, migrado (copiado, não removido) de `scripts/lib/municipios_ba.py:ALIASES`:
  `2928505: ["santa teresinha"]` — o GAC escreve *Santa Teresinha*, o IBGE *Santa Terezinha*.
- **criar** `research_pipeline/tests/test_aliases.py`

**Verificar:** `python -m research_pipeline.aliases` imprime tabela de 29 linhas
(`id | sigla | chave_curta | nome`); `python -m pytest research_pipeline/tests/test_aliases.py`
afirma: exatamente **14** consórcios com sigla; `29302 → CIVALERG`; `45429 → CISUDOESTE`
(separador `\x96`); `9742 → CONSISAL`; `chave_curta` de `9742` é `"sisal"`, de `8108` é
`"portal do sertao"`, de `29308` é `"bacia do rio corrente"`.

---

## Patch 6 — Matcher determinístico (o pré-filtro barato)

**Objetivo:** resolver nomes a ids canônicos com método + confiança, **sem nenhum LLM**.

**Arquivos**
- **criar** `research_pipeline/config/matching.yaml` — `confianca_exato: 1.0`, `confianca_alias: 0.92`,
  `municipio_fuzzy_minimo: 0.60`, `consorcio_fuzzy_minimo: 0.0` (decisão E),
  `fuzzy_delta_ambiguidade: 0.05`, `confianca_aviso: 0.7`, `confianca_heranca: 0.5`.
- **criar** `research_pipeline/matcher.py`
  - `Match(id: str|None, nome: str|None, metodo: Literal["exato","alias","fuzzy","inferido","nenhum"],
    confianca: float, raw: str, ambiguo: bool, candidatos: tuple[tuple[str,str,float], ...])` —
    `candidatos` é o top-5 `(id, nome, score)`, exatamente o que o LLM desempatador recebe depois.
    **Nunca os 417/29.**
  - `RefIndex` construído de `ReferenceData` + `AliasOverrides`; `match_municipio(raw)`,
    `match_consorcio(raw)`.
  - Score município: `0.5 * (fuzz.ratio + fuzz.token_sort_ratio) / 100`.
    Score consórcio: `max(token_set_ratio, WRatio) / 100` — é o `token_set_ratio` que faz
    `"Consórcio Bacia do Paramirim"` marcar 100 contra o nome oficial de 12 tokens.
  - **Decisão E aplicada:** município abaixo de `0.60` → `id=None`, `metodo="nenhum"`, aviso
    `municipio_nao_resolvido`, `*_raw` preservado. Consórcio **sempre** recebe o mais próximo
    (decisão 4 do GOAL.md), com confiança e método obrigatórios.
  - Top-dois dentro de `fuzzy_delta_ambiguidade` → `ambiguo=True`. São as únicas linhas que
    chegarão ao LLM.
- **criar** `research_pipeline/tests/test_matcher.py`

**Verificar:** `python -m pytest research_pipeline/tests/test_matcher.py`, afirmando:
os 417 nomes exatos → `exato`, `1.0`; os 29 nomes exatos → `exato`; `"Caetite" → 2905404` `fuzzy ≥ 0.90`;
`"CIVALERG" → 29302` `alias`; `"Consórcio Bacia do Paramirim" → 14618`;
`"Consórcio Portal do Sertão" → 8108`; `"Consórcio Piemonte do Paraguaçu" → 29322`;
`"Consórcio do Vale do Rio Gavião" → 29302` (as quatro são as strings reais do teste manual);
`"Santa Teresinha" → 2928505` via override; e
**`"Bacia do Paramirim (Região)"` → `municipio_id=None`, `metodo="nenhum"`** — linha real do
PROMPT 2 que não é município.

---

## Patch 7 — Schemas Pydantic + validador duro

**Objetivo:** o contrato contra o qual AC1–AC4 são medidos, testável com objetos à mão, sem I/O.

**Arquivos**
- **criar** `research_pipeline/schemas.py` (pydantic v2, `ConfigDict(extra="forbid")` em tudo):
  `LicenciadoPor`, `MetodoMatch`, `Modalidade = Literal["LP","LI","LO","LAU","LU","Renovacao"]`,
  `Citation(url, titulo, trecho, indice)`, `LicencaBruta`, `LicencaNormalizada`,
  `RankingMunicipio`, `RankingConsorcio`, `Meta`, `Produto` (o envelope do §8).
- **criar** `research_pipeline/nodes/validate.py`
  - `validate_licencas(licencas, refs) -> tuple[list[LicencaNormalizada], list[str], list[str]]`
    → `(válidas, erros_duros, avisos)`
  - Regras duras: ≥1 `fonte_urls`, cada uma `http(s)://`; `data_consulta` presente;
    `data_concessao` data ISO real ou `None`; `municipio_id ∈ 417 | None`;
    `consorcio_id ∈ 29 | None`; `tipologia_codigo ∈ 17 | None`;
    `nivel_licenciamento ∈ {1,2,3,None}`; `id` único.
  - **Não-regras explícitas, cada uma com teste nomeado:** `consorcio_id` preenchido com
    `licenciado_por="municipio_proprio"` é **válido** (§6.4 final); `municipio_id=None` é válido
    (decisão E).
  - Regras moles → avisos: `*_match_confianca < 0.7`; `municipio_nao_apto`;
    `consorcio_divergente`; `consorcio_inesperado`; `nivel_uniforme` quando >90% compartilham
    o mesmo `nivel` (§11); `mineral_fora_vocabulario`.
- **criar** `research_pipeline/tests/test_validate.py` — table-driven, um caso por regra dura e
  por aviso, mais os dois casos "não pode rejeitar".

**Verificar:** `python -m pytest research_pipeline/tests/test_validate.py`.

---

## Patch 8 — Interface do estruturador, fixture semente, nó `extract`

**Objetivo:** `extract` rodável e verificável ponta a ponta **sem nenhuma chamada de API** — o
portão offline que precede todo trabalho pago.

**Arquivos**
- **criar** `research_pipeline/llm.py` — `Structurer` Protocol:
  `complete_json(*, system, user, tag, case=None) -> dict`. `FixtureStructurer` lê
  `tests/fixtures/llm_responses/{tag}[__{case}].json`; ausência levanta `FixtureMissing` nomeando
  o caminho exato que faltou. Chave por **`tag`, não por hash do prompt** — hash invalidaria toda
  fixture a cada edição de prompt. O arquivo guarda `_meta.prompt_sha` e a deriva gera aviso, não falha.
  `get_structurer("deepseek")` levanta `NotImplementedError("chega no patch 13")`.
- **criar** `research_pipeline/prompts/extract_v1.md` — transcrever fielmente; uma linha por
  licença; campo ausente → `null`; nunca inferir; datas só ISO; **descartar** as linhas da seção
  `## Indícios não confirmados`; saída `{"licencas": [...]}`.
- **criar** `research_pipeline/nodes/extract.py` — `extract(state, config) -> dict`; falha Pydantic
  por linha acumula em `validation_errors` em vez de abortar o lote. `licenciado_por_confianca`
  é produzido **aqui** (patch 0, item 9).
- **criar** `research_pipeline/tests/fixtures/raw_report_2025_seed.md` — **escrita à mão**
  (decisão B). O `gemini_deep_research_test.md` não serve: não tem URL de fonte, não tem coluna
  `Órgão emissor` nem `Licenciado por`, tem datas não-ISO e **é um ranking**, que o §5 regra 7
  proíbe. A semente usa as 13 colunas travadas do §5, partindo dos achados reais do PROMPT 2
  (Caturama ×2, Tremedal ×2, Pintadas, Ruy Barbosa, Santa Bárbara), com URLs claramente falsas
  `https://exemplo.invalid/...`, e semeia deliberadamente cada armadilha:

  | defeito semeado | exercita |
  |---|---|
  | `Caetite` sem acento | match fuzzy de município |
  | `CIVALERG` sozinho | match por sigla |
  | `Bacia do Paramirim (Região)` | não-município → `municipio_id=None` |
  | `Fevereiro/2025` | data não-ISO → `data_concessao=None` |
  | uma linha sem URL, sob `## Indícios não confirmados` | **não** pode ser extraída |
  | Granito "para revestimento" + Granito "britagem/agregados" | B3.5 vs B3.4 |
  | licença em município `nao_habilitado` | `municipio_nao_apto` |
  | consórcio ≠ o consórcio cadastral do município | `consorcio_divergente` |
  | consórcio atribuído a um dos 27 habilitados sem consórcio | `consorcio_inesperado` |
  | coluna consórcio vazia, município é membro | herança, `inferido`, `≤0.5` |
  | LAU assinada por secretaria **municipal** em município consorciado | `municipio_proprio` + `consorcio_id` não-nulo |

- **criar** `research_pipeline/tests/fixtures/llm_responses/extract.json` — resposta canônica.
- **criar** `research_pipeline/tests/fixtures/extracted_2025_seed.golden.json` — golden escrito à
  mão. É o que torna os patches 9–11 verificáveis com zero LLM no laço.
- **criar** `research_pipeline/tools/check_golden.py` — CLI que roda um nó contra a fixture e
  faz diff contra o golden (`json.dumps(sort_keys=True)`), saindo 1 na divergência. Decisão D:
  nós de LLM verificados por CLI, não por pytest.

**Verificar:**
```
RP_LLM=fixture python -m research_pipeline.tools.check_golden extract
```
esperado: `extract: OK (11 linhas, idêntico ao golden)`. A linha sem URL está ausente;
`Fevereiro/2025` virou `None`.

---

## Patch 9 — Nó `normalize`: núcleo determinístico + cruzamentos + avisos

**Objetivo:** `LicencaBruta[]` → `LicencaNormalizada[]` usando o matcher do patch 6, com LLM só
nas linhas genuinamente ambíguas.

**Arquivos**
- **criar** `research_pipeline/prompts/normalize_v1.md` — recebe só os `*_raw` e, por linha, o
  **top-5 de candidatos** (nunca as listas de 417/29, §7 final). A seção de desambiguação de
  substância é **renderizada em tempo de execução a partir de `SUBSTANCIAS_AMBIGUAS`** (patch 4),
  para que as dez colisões recebam a instrução por *uso*, não só Granito, com "na dúvida devolva
  `null` com justificativa".
- **criar** `research_pipeline/nodes/normalize.py`
  - passe determinístico: `RefIndex.match_municipio/match_consorcio` em toda linha;
    `substancia_raw` dobrada contra `build_substancia_index` (acerto único resolve sem LLM);
    `mineral` dobrado contra os 169 `SUBS`.
  - passe LLM: **uma** chamada em lote, só com as linhas onde `ambiguo`, ou `metodo=="nenhum"`,
    ou a substância tem >1 tipologia candidata. Na fixture semente isso é 3 de 11 linhas — é o
    ponto do pré-filtro.
  - cruzamentos, todos só-aviso, nenhum rejeita linha (§6.2):
    1. consórcio ausente no relatório + município resolvido → herda o consórcio cadastral,
       `metodo="inferido"`, `confianca=0.5`. **Herança nunca toca `licenciado_por`.**
    2. consórcio do relatório ≠ cadastral → prevalece o do relatório, aviso `consorcio_divergente`.
    3. município entre os 27 sem consórcio e relatório nomeia um → aviso `consorcio_inesperado`.
  - `licenciado_por` passa intocado do `extract` — este nó não tem o relatório e não pode
    reavaliá-lo.
- **criar** `research_pipeline/tests/fixtures/normalizadas_2025_seed.golden.json` e
  `llm_responses/normalize.json`.

**Verificar:**
```
RP_LLM=fixture python -m research_pipeline.tools.check_golden normalize
```
O golden fixa, por armadilha: `Caetite → 2905404 fuzzy ≥0.90`; `CIVALERG → 29302 alias`;
linha de herança com `metodo="inferido" confianca<=0.5`; `consorcio_divergente` exatamente 1×;
`consorcio_inesperado` exatamente 1×; `Bacia do Paramirim (Região)` com `municipio_id=None` +
`municipio_nao_resolvido`; Granito de revestimento → `B3.5`, de britagem → `B3.4`.

Mais um teste puro em `research_pipeline/tests/test_normalize_payload.py` (parte pura, decisão D):
afirma que o payload enviado ao estruturador contém **menos de 20** dos 417 nomes dobrados —
guarda mecânica contra reintroduzir a lista canônica no prompt.

---

## Patch 10 — `rank_and_emit`: ranking em Python puro, manifesto, diretório de run

**Objetivo:** produzir o artefato do §8 com ranking calculado em Python e estável entre execuções
(AC5, AC6).

**Arquivos**
- **criar** `research_pipeline/nodes/emit.py`
  - `slug_licenca(ano, municipio_nome, municipio_raw, modalidade, numero)` —
    `f"{ano}-{fold(nome).replace(' ','-')}-{modalidade.lower()}-{numero_slug}"`, sufixo `-2`/`-3`
    determinístico em colisão; cai em `fold(municipio_raw)` quando `municipio_id` é `None`.
  - `rank_municipios(licencas)` — conta tudo, discriminado por `licenciado_por`, mais
    `modo_predominante`.
  - `rank_consorcios(licencas)` — conta **só** `licenciado_por == "consorcio"` (§8), senão infla
    o consórcio com licenças que o município emitiu sozinho.
  - **Decisão F:** ordenação `(-total_licencas, fold(nome), id)`, `posicao = 1,2,3…` sem repetir.
    O empate fica visível em `total_licencas`.
  - `build_manifest(...)` — `run_id`, `ano`, `prompt_version`, ids de modelo,
    `refs_data_consulta` (`2026-08-01`, propagado dos dois JSONs, §11), timings, estimativa de
    custo, `avisos` deduplicados **mas contados**.
  - `emit(state, config)` — escreve `licencas_<ano>.json` e `manifest.json` no diretório do run.
- **criar** `research_pipeline/tests/test_emit.py` — só licenças sintéticas, sem fixture.

**Verificar:** `python -m pytest research_pipeline/tests/test_emit.py`, afirmando:
`ranking_consorcios` ignora linhas `municipio_proprio`; empate de 3 sai `posicao 1,2,3` em ordem
alfabética de nome dobrado; **embaralhar a lista de entrada 20 vezes produz JSON byte-idêntico**
(AC5 e AC6 como teste unitário); colisões de slug recebem sufixo determinístico.

---

## Patch 11 — Grafo, CLI, checkpointer, `--resume`, `--report` — pipeline offline completo

**Objetivo:** `python -m research_pipeline.run` produz o JSON final a partir de um relatório salvo,
**sem chave e sem gasto**, satisfazendo AC1–AC6 e AC8.

**Arquivos**
- **criar** `research_pipeline/nodes/research.py` — neste patch o nó **só** consome relatório salvo:
  se `state["raw_report"]` estiver setado, ou `runs/<run_id>/raw_report.md` existir, passa adiante;
  senão levanta `ResearchNotConfigured("nenhum relatório salvo; --research gemini chega no patch 14")`.
  Este **é** o comportamento do §9 ("relatório salvo pula o nó deep_research"), aterrissado antes
  de qualquer cobrança.
- **criar** `research_pipeline/graph.py` — `build_graph(checkpointer)`; `PipelineState` do §3
  **menos `refs`** (decisão G) **mais** `run_id`, `avisos`, `manifest_path`; arestas
  `load_refs → deep_research → extract → normalize → validate → {repair | rank_and_emit}`;
  `_should_repair(state)` devolve `"repair"` enquanto `repair_attempts < 2`.
  **Roteamento do reparo: volta para `normalize`, não para `extract`** — erro de id canônico ou de
  vocabulário não se corrige retranscrevendo, e reexecutar `extract` convida o modelo a inventar
  linhas para satisfazer a mensagem de erro. Só o caso degenerado de zero linhas parseadas
  reexecuta `extract`. Erros de validação são realimentados literalmente como mensagem extra.
- **criar** `research_pipeline/run.py` — argparse: `--ano` (obrigatório salvo com `--resume`),
  `--resume RUN_ID`, `--report PATH`, `--llm {fixture,deepseek}` (default de `RP_LLM`),
  `--research {none,gemini}` (default de `RP_RESEARCH`, `none` aqui), `--runs-dir`
  (default `research_pipeline/runs`), `--dry-run` (só carregador + invariantes, sai 0).
  Carrega `.env` com `python-dotenv`; `load_reference_data()` roda **primeiro, sempre** — o
  "antes de qualquer chamada de API" do AC8 é garantido pela ordem de chamada em `main()`.
  `run_id = f"{ano}_{utcnow:%Y%m%dT%H%M%SZ}"`.
  `SqliteSaver.from_conn_string("research_pipeline/runs/checkpoints.db")`.
- **criar** `research_pipeline/tests/test_acceptance_offline.py` — parte pura: afirma cada critério
  de aceite por número, inclusive AC5 rodando duas vezes em dois `tmp_path` e comparando os
  conjuntos recursivos de chaves (valores podem diferir, chaves não).

**Verificar — o comando mais importante do plano, e custa zero:**
```
python -m research_pipeline.run --ano 2025 \
  --report research_pipeline/tests/fixtures/raw_report_2025_seed.md \
  --llm fixture --runs-dir /tmp/rp-runs
```
esperado: imprime `run_id`, a lista de avisos, e escreve
`/tmp/rp-runs/2025_.../licencas_2025.json` + `manifest.json`. Depois:
```
python -m research_pipeline.run --resume 2025_<ts> --llm fixture --runs-dir /tmp/rp-runs
```
completa sem reinvocar o nó de pesquisa (contador de chamadas no teste) — a metade offline do AC7.
E `python -m research_pipeline.run --dry-run` como pré-voo barato antes de qualquer gasto.

---

## Patch 12 — `prompts/deep_research_v1.md` (texto puro, sem chave, revisável isolado)

**Objetivo:** aterrissar o artefato de maior risco humano sozinho, para ser discutido sem código no diff.

**Arquivos**
- **criar** `research_pipeline/prompts/deep_research_v1.md` — `{{ANO}}` como único placeholder;
  as 13 colunas nomeadas na ordem exata do §5 regra 2; regras explícitas de uma-linha-por-licença,
  data ISO ou `null`, URL de fonte obrigatória, seção separada `## Indícios não confirmados`,
  proibição de inferir `nível`, proibição de ranquear, `órgão emissor` nomeado + trecho citado
  para `licenciado_por`, e a lista de fontes prioritárias (diários oficiais municipais, portais e
  portarias dos consórcios, CEPRAM/INEMA, SICOM/TCM-BA).
- **criar** `research_pipeline/tests/test_prompt_deep_research.py`

**Verificar:** `python -m pytest research_pipeline/tests/test_prompt_deep_research.py`, afirmando:
`{{ANO}}` ocorre exatamente 1×; os 13 cabeçalhos aparecem na ordem; "ranking"/"ranquear" só
dentro de frase de proibição; e — o teste que de fato faz cumprir a decisão travada 13 —
**no máximo 3 dos 417 nomes dobrados de município e nenhum dos 29 nomes/siglas de consórcio**
aparecem como palavra inteira no prompt. Ninguém reintroduz a lista de 417 sem quebrar o teste.

---

## Patch 13 — `DeepSeekStructurer` (primeira API real, ~US$ 0,01)

**Objetivo:** trocar o estruturador de fixture pelo modelo real, atrás do mesmo Protocol.

**Arquivos**
- **criar** `research_pipeline/llm_deepseek.py` — `ChatOpenAI(base_url="https://api.deepseek.com/v1",
  model="deepseek-v4-flash", temperature=0, model_kwargs={"response_format": {"type": "json_object"}})`,
  retry/backoff em 429/5xx, contabilidade de tokens e custo no manifesto.
  Modelo e preço **confirmados na doc oficial**: `deepseek-v4-flash`, contexto 1M,
  US$ 0,14/1M in (cache miss) · US$ 0,28/1M out, saída máx. 384K.
- **modificar** `research_pipeline/llm.py` — `get_structurer("deepseek")` passa a devolvê-lo;
  acrescentar `RP_FIXTURE_RECORD=1` para gravar a resposta real em `tests/fixtures/llm_responses/`,
  mantendo as fixtures honestas em vez de escritas à mão para sempre.

**Verificar offline primeiro:** `python -m pytest` → tudo continua passando (nenhum teste novo
exige chave). **Depois online**, uma chamada:
```
python -m research_pipeline.run --ano 2025 \
  --report research_pipeline/tests/fixtures/raw_report_2025_seed.md \
  --llm deepseek --runs-dir /tmp/rp-runs
```
e regravar fixtures com `RP_FIXTURE_RECORD=1`.

---

## Patch 14 — Nó Gemini Deep Research (o único patch de US$ 1–3)

**Objetivo:** a perna paga, com a retomada provada offline antes de uma chamada real.

**Arquivos**
- **criar** `research_pipeline/research.py` — `ResearchClient` Protocol
  (`start(prompt) -> str`, `poll(interaction_id) -> ResearchResult | None`);
  `GeminiDeepResearch` com `google-genai`:
  ```python
  client.interactions.create(
      input=prompt,
      agent="deep-research-preview-04-2026",
      background=True,
      store=True,
      agent_config={"type": "deep-research", "thinking_summaries": "auto",
                    "visualization": "off", "collaborative_planning": False},
  )
  ```
  polling via `client.interactions.get(id)` até `status == "completed"`; texto em
  `interaction.steps[-1].content[0].text`; citações → `citations.json`;
  `FakeResearchClient` para teste. **Contrato e ids confirmados na doc oficial**
  (`deep-research-preview-04-2026` / `deep-research-max-preview-04-2026`, structured output
  não suportado, `visualization` aceita `"auto"|"off"` — daí a correção do patch 0).
- **modificar** `research_pipeline/nodes/research.py` — três ramos: relatório salvo → pula;
  `state["interaction_id"]` setado → só retoma o polling; senão `start()` e
  **grava `interaction_id` no checkpoint antes do primeiro poll**. Essa ordem é o AC7 inteiro.
- **modificar** `research_pipeline/run.py` — habilitar `--research gemini`, `--poll-timeout`
  (default 3600 s), `--research-model`; salvar `prompt.md` após substituir `{{ANO}}`.
- **criar** `research_pipeline/tests/test_research_resume.py` — `FakeResearchClient` contando
  `start()`; afirma que matar-e-retomar nunca chama `start()` duas vezes.
- **criar** `research_pipeline/README.md` — o laço offline (`--report` + `--llm fixture`), o laço
  pago, e o procedimento de atualizar fixtures.

**Verificar offline:** `python -m pytest research_pipeline/tests/test_research_resume.py` passa sem
chave; contagem de `start()` é 1 num crash-e-retomada simulado. **Depois online, uma vez:**
```
python -m research_pipeline.run --ano 2025 --research gemini --llm deepseek
```

**Passo manual obrigatório logo após esse run:** copiar
`runs/<run_id>/raw_report.md` para `research_pipeline/tests/fixtures/raw_report_2025_real.md`
e commitar. `research_pipeline/runs/` é gitignored (patch 1) — sem esse passo o artefato de
US$ 1–3 se perde e toda iteração futura de prompt repaga.

---

## Sequenciamento

| # | Patch | Chave? | Verificação |
|---|---|---|---|
| 0 | Corrigir GOAL.md → v1.4 | não | revisão do diff |
| 1 | Andaime: deps, `.env`, pytest | não | `pip install -r requirements.txt` + imports |
| 2 | `common/`: `fold()` + `read_dbf()` | não | `pytest common/tests` (paridade 417) |
| 3 | Carregador + **AC8** | não | `python -m research_pipeline.refs` |
| 4 | Vocabulários + 2 armadilhas XLSX | não | `pytest test_vocab.py` |
| 5 | Aliases mecânicos | não | `python -m research_pipeline.aliases` |
| 6 | Matcher determinístico | não | `pytest test_matcher.py` |
| 7 | Schemas + validador | não | `pytest test_validate.py` |
| 8 | Estruturador fixture + `extract` + **fixture semente** | não | `check_golden extract` |
| 9 | `normalize` + cruzamentos | não | `check_golden normalize` |
| 10 | Ranking + manifesto | não | `pytest test_emit.py` |
| 11 | **Grafo + CLI + checkpointer + `--resume`/`--report`** | não | run offline completo, AC1–AC6+AC8 |
| 12 | `deep_research_v1.md` | não | `pytest test_prompt_deep_research.py` |
| 13 | DeepSeek real | sim, ~US$ 0,01 | offline passa; um run barato |
| 14 | Gemini Deep Research | sim, US$ 1–3 | retomada provada offline; um run pago |

AC8 aterrissa no patch 3. O caminho offline completo aterrissa no patch 11, **dois patches antes
de qualquer cobrança**.

---

## Verificação de ponta a ponta

Depois do patch 11 (custo zero):
```
python -m research_pipeline.run --dry-run                       # invariantes 417/29/386
python -m research_pipeline.run --ano 2025 \
  --report research_pipeline/tests/fixtures/raw_report_2025_seed.md \
  --llm fixture --runs-dir /tmp/rp-runs
python -m pytest                                                # partes puras
python -m research_pipeline.tools.check_golden extract normalize
```
O JSON em `/tmp/rp-runs/2025_*/licencas_2025.json` deve validar contra `Produto` (AC1), ter
`fonte_urls` e `data_consulta` em toda linha (AC2), todo `municipio_id` não-nulo entre os 417 e
`consorcio_id` entre os 29 (AC3), `tipologia_codigo` no vocabulário fechado (AC4), e chaves
idênticas entre dois runs (AC5). O manifesto deve trazer os avisos `consorcio_divergente`,
`consorcio_inesperado`, `municipio_nao_resolvido`, `municipio_nao_apto` e
`tipologia_porte_ausente:B4.2:*` — as armadilhas semeadas na fixture, todas visíveis.

Depois do patch 14 (US$ 1–3, uma vez):
```
python -m research_pipeline.run --ano 2025 --research gemini --llm deepseek
cp research_pipeline/runs/<run_id>/raw_report.md \
   research_pipeline/tests/fixtures/raw_report_2025_real.md
```

## Arquivos de referência

- `research_pipeline/GOAL.md` — escopo travado
- `scripts/lib/municipios_ba.py` — origem de `fold()` e `read_dbf()`; **não modificar**
- `data/processed/municipios_habilitados.json` (417) · `data/processed/consorcios.json` (29)
- `data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx` — aba `Divisão B - Mineração`
- `data_source/BA-shapefile/BA.dbf` — coluna `SUBS`, 169 valores
- `research_pipeline/gemini_deep_research_test.md` — origem dos nomes reais da fixture
