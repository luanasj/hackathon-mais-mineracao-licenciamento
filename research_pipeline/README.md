# research_pipeline

Pipeline LangGraph que transforma uma pesquisa Deep Research em um produto de dados reprodutível:
um JSON onde cada registro é **uma licença ambiental de mineração concedida por um município
baiano**, com `municipio`/`consorcio` resolvidos contra as tabelas canônicas, `tipologia` no
vocabulário fechado do Anexo IV e procedência obrigatória.

Escopo travado: [`GOAL.md`](GOAL.md). Histórico e decisões de implementação:
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

```
research_start → research → extract → normalize → validate → {repair | rank_and_emit}
   Gemini          Gemini    DeepSeek   DeepSeek    Python        Python puro
```

## O laço offline — custo zero, nenhuma chave

É onde se itera prompt, matcher e ranking. `--report` injeta um relatório já salvo e pula a perna
paga inteira; `--llm fixture` lê as respostas de `tests/fixtures/llm_responses/` em vez de chamar
a DeepSeek.

```bash
python -m research_pipeline.run --dry-run --ano 2025      # só carregador + invariantes (AC8)

python -m research_pipeline.run \
    --ano 2025 \
    --report research_pipeline/tests/fixtures/raw_report_2025_seed.md \
    --llm fixture

python -m pytest                                          # suíte inteira, offline
RP_LLM=fixture python -m research_pipeline.tools.check_golden extract
RP_LLM=fixture python -m research_pipeline.tools.check_golden normalize
```

Nenhum comando acima lê `GEMINI_API_KEY` ou `DEEPSEEK_API_KEY`, e nenhum sai para a rede.

## O laço pago

Duas pernas independentes, cada uma com o seu preço:

| Perna | Flag | Preço |
|---|---|---|
| Pesquisa (Gemini Deep Research) | `--research gemini` | US$ 1–3 por run (`…-max-…`: US$ 3–7) |
| Estruturação (DeepSeek) | `--llm deepseek` | ~US$ 0,01 por run |

```bash
cp .env.example .env      # e preencha GEMINI_API_KEY / DEEPSEEK_API_KEY
python -m research_pipeline.run --ano 2025 --research gemini --llm deepseek
```

Sem `GEMINI_API_KEY` no ambiente, `--research gemini` sai com código `2` **antes** de criar
`run_dir` — a mesma política do AC8 aplicada à perna paga: falhar antes de gastar.

**`--research gemini` cria uma tarefa cobrada assim que o nó `research_start` roda.** Se você só
quer conferir o encaminhamento, use `--report`: qualquer invocação com `--research gemini` e chave
presente gasta.

### Retomada — o que impede repagar os US$ 1–3

O `interaction_id` vai para o checkpoint quando `research_start` **retorna**, antes de o polling
começar. Um processo morto no meio da espera retoma a mesma tarefa:

```bash
python -m research_pipeline.run --resume 2025_20260801T143200Z
```

`--resume` e `--report` são mutuamente exclusivos. `--poll-timeout` (padrão 3600 s) estourar não é
perda: o `interaction_id` já está no checkpoint, e `--resume` recomeça o polling da mesma tarefa.

## Ciclo trimestral — a rotina completa

`research_pipeline/runs/` é gitignored: **o que não for copiado para fora do diretório do run se
perde**, e o relatório perdido custa US$ 1–3 para refazer. Os cinco passos abaixo são um bloco, não
uma sugestão.

```bash
# 1. a pesquisa (US$ 1-3)
python -m research_pipeline.run --ano <ano> --research gemini --llm deepseek

# 2. o relatório bruto vira fixture versionada — sem isto o artefato pago some
cp research_pipeline/runs/<run_id>/raw_report.md \
   research_pipeline/tests/fixtures/raw_report_<ano>_<AAAAQT>.md

# 3. o produto vira dado versionado, um arquivo por rodada (nunca sobrescrever)
cp research_pipeline/runs/<run_id>/licencas_<ano>.json \
   data/processed/licencas/<run_id>.json

# 4. regerar o seed do banco
python scripts/generate_seed_sql.py

# 5. reconstruir o banco
docker compose down -v && docker compose up --build
git add research_pipeline/tests/fixtures/ data/processed/licencas/ documentation/seed.sql
```

O `-v` do passo 5 não é opcional: `docker/entrypoint.sh` **reusa** o banco existente no volume e
não reprocessa o `seed.sql`. Sem apagar o volume, a rodada nova não aparece e nada avisa.

**Cada rodada acrescenta, nenhuma substitui.** `data/processed/licencas/` guarda um arquivo por
`run_id`, e o `run_id` já carrega ano e timestamp — é isso que faz a comparação entre trimestres
existir. Sobrescrever o arquivo do trimestre anterior apagaria a série que se quer medir.

### Reprocessar sem repagar

Corrigir prompt de extração, schema ou matcher **não** exige nova pesquisa: o relatório bruto está
versionado desde o passo 2.

```bash
python -m research_pipeline.run --ano <ano> \
    --report research_pipeline/tests/fixtures/raw_report_<ano>_<AAAAQT>.md \
    --llm deepseek                      # ~US$ 0,01
```

Depois repita os passos 3–5 com o `run_id` novo.

## Atualizar as fixtures de resposta do LLM

`tests/fixtures/llm_responses/{tag}[__{case}].json` alimenta `--llm fixture`. Para regravá-las a
partir de respostas reais da DeepSeek em vez de editá-las à mão:

```bash
RP_FIXTURE_RECORD=1 python -m research_pipeline.run \
    --ano 2025 --report <relatório real> --llm deepseek
```

`RecordingStructurer` envolve o estruturador real e grava cada resposta no formato que
`FixtureStructurer` lê, com `_meta.prompt_sha` calculado do prompt exato daquela chamada. Depois,
regenere os goldens que dependem delas e confira o diff antes de commitar:

```bash
RP_LLM=fixture python -m research_pipeline.tools.check_golden extract
RP_LLM=fixture python -m research_pipeline.tools.check_golden normalize
```

`prompt_sha` divergente vira `logger.warning`, nunca falha — editar o texto de um prompt não
invalida a fixture, só sinaliza que a resposta foi gravada contra outra redação.

## Artefatos de um run

```
research_pipeline/runs/2025_20260801T143200Z/
├── prompt.md             o prompt de pesquisa após substituir {{ANO}} (gravado em todo run)
├── raw_report.md         resposta bruta do Deep Research
├── citations.json        citações (url, título, trecho, índice)
├── manifest.json         parâmetros, versões, contagens, avisos
└── licencas_2025.json    ← PRODUTO FINAL
```

Checkpoints ficam em `research_pipeline/runs/checkpoints.db`, um `thread_id` por `run_id`.

`citations.json` guarda URLs de *redirect* do grounding
(`vertexaisearch.cloud.google.com/grounding-api-redirect/…`), que expiram. Não é problema de
procedência: o `fonte_urls` de cada licença sai da coluna "Fonte (URL)" da tabela do relatório, com
o link real do diário oficial. Mas `citations.json` não serve como arquivo de fontes a longo prazo.

## No banco

Depois do passo 4 do ciclo, o produto vira três tabelas em `documentation/schema.sql` —
`pesquisa_run` (uma linha por rodada), `licenca` (uma por licença concedida) e `pesquisa_aviso` —
mais a view `licenca_por_municipio_ano`. Navegáveis em `localhost:8080` (`sqlite-web`).

```sql
-- comparação entre rodadas
SELECT ano_referencia, ano_completo, COUNT(*) AS licencas,
       COUNT(DISTINCT codigo_ibge) AS municipios
FROM licenca JOIN pesquisa_run USING (run_id)
GROUP BY run_id ORDER BY ano_referencia;
```

`ano_completo = 0` marca a rodada de um ano ainda em curso. Comparar a contagem de um ano parcial
com a de um ano fechado sem olhar essa coluna produz a leitura errada de "queda".

## Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `GEMINI_API_KEY` | exigida por `--research gemini` |
| `DEEPSEEK_API_KEY` | exigida por `--llm deepseek` |
| `RP_LLM` | padrão de `--llm` (`fixture` \| `deepseek`) |
| `RP_RESEARCH` | padrão de `--research` (`none` \| `gemini`) |
| `RP_FIXTURE_RECORD=1` | grava toda resposta real do LLM como fixture |
