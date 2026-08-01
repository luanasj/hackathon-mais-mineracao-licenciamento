# Plano de implementação — `research_pipeline`

> **15 patches (0–14).** Derivado de `research_pipeline/GOAL.md` — **v1.4** desde o patch 0.
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

## Patch 0 — Corrigir GOAL.md para v1.4 ✅ criado

**Objetivo:** eliminar os erros factuais antes que alguém implemente contra eles.

**Feito.** As 13 correções abaixo estão aplicadas em `GOAL.md` v1.4, mais três itens que a revisão
do diff expôs: o exemplo do §8 tinha `nivel_licenciamento: 3` na **mesma** licença que o §6.1 agora
traz como `null` (`normalize` não vê o relatório, logo não pode preencher nível que `extract`
devolveu nulo); a decisão travada 4 foi emendada para apontar a exceção do piso de 0.60, em vez de
contradizer o §6.2 corrigido; e as decisões E–H entraram no §12 como itens **16–19**.

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
   fixa sobre Granito. **Emenda do patch 4:** são **treze**, não dez — `caulim` estava escondido
   atrás de uma chave-lixo e `quartzo`/`quartzito` só não colidiam por causa do plural. Também
   muda a grafia de duas: `granitos` e `sienitos` viram `granito` e `sienito`.
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

## Patch 1 — Andaime: dependências, pacotes, `.env`, pytest ✅ feito

**Objetivo:** fazer `python -m research_pipeline...` e `pytest` funcionarem, com segredo tratado
antes de existir chave.

**Feito**, com três desvios do que estava escrito abaixo:

1. `.gitignore` recebeu `.env` + `.env.*` + `!.env.example` em vez de listar `.env.local` literal —
   pega `.env.production`, `.env.gemini` e o que mais aparecer, e a negação mantém o template
   rastreado. Verificado com `git check-ignore -v`.
2. `research_pipeline/tools/__init__.py` entrou junto com os irmãos: o patch 8 chama
   `python -m research_pipeline.tools.check_golden`, e criar o pacote agora é mais barato que um
   commit de andaime avulso depois.
3. **`PyYAML` não era "usado implicitamente"** — nenhum `.py` do repo importa `yaml` hoje; ele só
   estava instalado no ambiente por acaso. Passa a ser dependência de verdade no patch 3, que lê
   `config/ref_mapping.yaml`. Declarado de todo modo.

Resolução conferida em Python 3.12.1, sem conflito: `langgraph 1.2.10`,
`langgraph-checkpoint-sqlite 3.1.1`, `langchain-core 1.5.3`, `langchain-openai 1.4.1`,
`google-genai 2.16.0`, `pydantic 2.13.4`, `rapidfuzz 3.14.5`, `openpyxl 3.1.5`,
`python-dotenv 1.2.2`, `pytest 9.1.1`. `SqliteSaver.from_conn_string` existe nessa versão —
checagem adiantada e grátis do que o patch 11 precisa.

Os `__init__.py` de `tests/` são carga estrutural, não formalidade: no `importmode=prepend`, o
pytest sobe do arquivo de teste enquanto achar `__init__.py` e insere no `sys.path` o primeiro
diretório **sem** um. Com `common/tests/__init__.py` + `common/__init__.py` esse diretório é a raiz
do repo — que é o que fará `import common.text` funcionar nos testes do patch 2 sem nenhum hack de
`sys.path` como o de `scripts/collect_gac.py:60`.

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

## Patch 2 — `common/`: dobra de texto e leitor DBF ✅ feito

**Objetivo:** pacote compartilhado importável, sem tocar em `scripts/`.

**Feito**, com quatro registros — o primeiro é uma contradição deste plano, achada antes de
escrever código:

1. **Apóstrofo é removido, não vira espaço.** A especificação abaixo dizia *"apóstrofos (`' ‘ ’ \``)
   **e hífens** → espaço"*, o que daria `dias d avila`, mas a linha de verificação do próprio patch
   exigia `fold("Dias d'Ávila") == "dias davila"`. O `GOAL.md` §7.2 (escopo travado) é inequívoco e
   concorda com a verificação: *"sem hífen nem apóstrofo (`Dias d'Ávila` → `dias davila`,
   `Xique-Xique` → `xique xique`)"*. Prevalece o `GOAL.md`; a especificação abaixo está corrigida.
   Assimetria de propósito: hífen une duas palavras (vira espaço), apóstrofo marca elisão dentro de
   uma (é removido). Medido com `rapidfuzz` nas duas políticas contra 8 grafias plausíveis daquele
   nome — remover dá 6/8 exatos, mapear para espaço dá 5/8, e nenhuma das duas cai abaixo do piso de
   0.60 do patch 6 em caso algum. A escolha não era arriscada; deixar dois documentos discordando era.
   **Consequência: a paridade com `_normalize` tem duas exceções, não uma** (`Dias d'Ávila` e
   `Xique-Xique`), e as duas estão travadas com os valores exatos dos dois lados.
2. **`\x96` entrou em `TRACOS`.** `'\x96'.isspace()` é `False` e o NFKD não o toca, então sem
   tratamento o consórcio `45429` dobrava para
   `'consorcio intermunicipal do sudoeste da bahia \x96 cisudoeste'` — caractere de controle C1 no
   meio da chave de match, que o `token_set_ratio` do patch 6 veria como token e a cascata de
   prefixos do patch 5 arrastaria para dentro da `chave_curta`. É en-dash mojibake de cp1252, isto
   é, semanticamente um traço: tratá-lo junto com o hífen é a leitura fiel de *"sem hífen"* do §7.2,
   não escopo novo. `TRACOS = ("-", "–", "—", "\x96", "\x97")`. Depois disso os 29 nomes dobrados
   ficam ASCII puro. Isso **não** conflita com o `SEPARADOR_SIGLA` do patch 5: a sigla sai do nome
   **cru**, porque a regra do §7.2 exige caixa alta e a dobra destrói a caixa — o docstring de
   `common/text.py` registra essa ordem.
3. **`read_dbf` ganhou duas guardas** que o `_read_dbf` original não tem: versão DBF fora de `0x03`
   e flag de deleção fora de `0x20` levantam `DbfError`. Os dois arquivos reais são dBASE III com
   zero registros deletados (medido: todas as flags `0x20`), então a paridade continua exata; as
   guardas só trocam corrupção silenciosa por falha alta, que é a política do plano inteiro. Sem a
   segunda, um `.dbf` regenerado com registros marcados devolveria contagem errada sem avisar.
4. **`common/tests/conftest.py`** acrescentado para o fixture que carrega o original por
   `spec_from_file_location`, usado pelos dois testes de paridade em vez de duplicado.

37 testes, todos passando. Fatos medidos que eles agora travam: divergência com `_normalize` em
exatamente 2 dos 417 nomes; **zero colisões** entre os 417 nomes dobrados (a premissa do match
exato do patch 6) e entre os 29 consórcios; `fold` idempotente; `BA.dbf` = 31.858 × 12 com 169
`SUBS` distintos; `BA_Municipios_2025.dbf` = 417 × 15 com acento intacto (prova o UTF-8 do `.cpg`).
Suíte verificada por mutação — trocar a política de apóstrofo quebra 4 testes, remover `\x96` de
`TRACOS` quebra 1.

Conferido de passagem, mas **o teste fica para o patch 3**, onde `load_reference_data` existe e
`data/processed/` já está em escopo: os 417 nomes de `municipios_habilitados.json` são idênticos aos
do IBGE, 0 divergências.

**Arquivos**
- **criar** `common/text.py` — `fold(text) -> str`: NFKD → remove combinantes → **remove**
  apóstrofos (`' ‘ ’ \``) → traços (`- – —` e os mojibakes `\x96 \x97`) viram espaço → minúsculo →
  colapsa espaços. Docstring aponta a origem (`scripts/lib/municipios_ba.py:_normalize`) e as
  **duas** divergências intencionais que o §7.2 exige: aquele põe espaço no apóstrofo e mantém o
  hífen; este remove o apóstrofo e dobra o traço.
- **criar** `common/dbf.py` — `read_dbf(path, encoding="utf-8")`, cópia do `_read_dbf` original mais
  `DbfError` e as duas guardas. Docstring registra por que existe cópia em vez de import: `scripts/`
  não tem `__init__.py` e usa `sys.path` hack; acoplar um script de coleta pontual ao produto de
  longa vida é pior que 35 linhas duplicadas. Registra também que todo valor volta `str` stripado,
  inclusive os campos `N`.
- **criar** `common/tests/test_text_parity.py` — carrega `scripts/lib/municipios_ba.py` via
  `importlib.util.spec_from_file_location` e afirma `fold(n) == _normalize(n)` para os 417 nomes,
  **exceto** `Xique-Xique` e `Dias d'Ávila`, onde deve divergir. Trava a divergência para que uma
  mudança futura em qualquer lado quebre alto.
- **criar** `common/tests/test_text.py` (contrato de `fold` isolado), `common/tests/test_dbf.py`
  (paridade nos dois `.dbf` reais + as duas negativas em `tmp_path`) e `common/tests/conftest.py`.

**Verificar:** `python -m pytest common/tests` → passa. Fatos já medidos que os testes fixam:
`fold("Dias d'Ávila") == "dias davila"`, `fold("Xique-Xique") == "xique xique"`, **zero colisões**
de nome dobrado entre os 417.

---

## Patch 3 — Carregador de referências + invariantes (AC8) ✅ feito

**Objetivo:** satisfazer o critério de aceite 8 por completo e falhar alto antes de qualquer gasto.

**Feito**, com três achados que a forma real dos arquivos impôs:

1. **`data_consulta` não está simétrico nos dois arquivos.** `municipios_habilitados.json` o traz
   **por registro** e não na raiz; `consorcios.json` só **na raiz** e não por registro. O bloco
   `fields:` do §7 mapeia apenas o do município, então `ReferenceData.data_consulta` — que é escalar
   e vira `meta.refs_data_consulta` no manifesto (§11) — não teria de onde ler nem conferir o lado
   dos consórcios. Resolvido com um bloco **`meta:`** novo no YAML para as chaves de raiz, sem tocar
   no `fields:` do §7. Os 417 têm de concordar entre si e com a raiz de `consorcios.json`;
   discordância é `RefLoadError`, não aviso — um manifesto com uma data quando as referências vieram
   de duas coletas é procedência falsa, e recoletar é barato.
2. **O mapeamento é projeção, não esquema.** `data_publicacao` existe nos 417 (`dd/mm/yyyy`, nenhum
   nulo, inclusive nos 50 não habilitados) e não está no §7. Não entra: o §8 não o usa. A regra
   ficou explícita e testada nos dois sentidos — campo *mapeado* ausente é `RefLoadError` nomeando
   arquivo, campo e id; campo da fonte **não** mapeado é ignorado em silêncio. É o oposto do
   `extra="forbid"` do patch 7, de propósito: lá o contrato é nosso, aqui a fonte é de terceiro e
   ganhar coluna não pode derrubar a carga.
3. **O `GOAL.md` §7.2 erra sobre Santa Terezinha.** Diz *"`SANTA TERESINHA` (GAC) ↔ `Santa Terezinha`
   (IBGE)"*. Medido: o GAC escreve `Santa Terezinha`, com **z**, idêntico ao IBGE — e os 417 nomes
   batem crus **e** dobrados, 0 divergências, que é justamente a conferência que o patch 2 adiou
   para cá. O `ALIASES` de `scripts/lib/municipios_ba.py:67` não corrige divergência entre as duas
   fontes: é alias para a grafia com **s** que aparece em texto de terceiro, e continua necessário no
   patch 5 por esse motivo — a prosa do patch 5 abaixo está corrigida. O `GOAL.md` **não** foi
   reaberto (não é escopo deste patch); fica registrado aqui para correção futura.

Mais dois desvios menores: `membro_fields:` no YAML, para que o formato dos registros aninhados de
`consorcios.json` também saia do mapeamento em vez de virar nome de campo hardcoded no carregador; e
`_check_invariants` **acumula** todos os problemas antes de levantar, em vez de parar no primeiro —
num arquivo recoletado com defeito sistemático, parar no primeiro esconde os outros 416 e transforma
a conferência em laço de tentativa e erro.

Às invariantes da especificação abaixo somaram-se cinco que os arquivos permitiam afirmar de graça,
todas medidas em 0 divergências: chave do dict == campo `id` mapeado (pega um arquivo rechaveado);
`nivel is None` ⟺ `nao_habilitado`; `consorcio_nome is None` ⟺ `consorcio_id is None`;
`consorcio_nome` == nome do consórcio nos 386 vínculos; e os três campos redundantes embutidos em
`consorcios.json` (`municipio`, `nivel`, `status`) batendo com o registro do município. Esses três
redundantes **não viram estado** — `Consorcio.membros` guarda só `codigo_ibge`, porque duplicá-los
criaria duas fontes de verdade para o mesmo fato.

38 testes novos, 75 no total, todos passando. 15 deles são corrupções em `tmp_path`, uma por vez,
cada uma casando a **mensagem** e não só o tipo — casar só `RefLoadError` deixaria a invariante certa
passar a ser pega por acidente pela invariante errada depois de um refactor. Suíte verificada por
mutação: neutralizar `_check_invariants` quebra 7 testes, deixar `_coerce_nivel` aceitar `int` quebra
2, fixar `apto_licenciar=True` quebra 2.

Dataclass e não pydantic, decidido aqui: `refs` não entra no estado checkpointado (decisão G, vai em
`config["configurable"]`), logo não há serialização a validar, e é caminho quente do matcher do
patch 6. A validação precisa apontar *qual* dos 417 registros está errado, coisa que
`ValidationError` não dá de graça em invariante cruzada.

**Arquivos**
- **criar** `research_pipeline/config/ref_mapping.yaml` — o mapeamento do §7, mais bloco
  `invariantes:` (`municipios_esperados: 417`, `consorcios_esperados: 29`, `soma_total_municipios: 386`)
  e os dois blocos que os achados 1 e 3 exigiram: `meta:` (chaves de raiz) e `membro_fields:`.
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
`27 habilitados sem consórcio`, `data_consulta: 2026-08-01`, a `fonte:` do GAC e `invariantes: OK`.
Mais `python -m pytest research_pipeline/tests/test_refs.py`.

Todos esses números já foram conferidos contra os arquivos reais, inclusive os dois que o GOAL.md
não afirma: `status`↔`situacao_gac` nunca discordam, e `consorcio_nome` é idêntico entre os dois
arquivos nos 386 vínculos (0 divergências).

**Não faz ainda:** nada de XLSX, DBF, matching ou aliases.

---

## Patch 4 — Vocabulários: tipologias (XLSX) + minerais (DBF), com as duas armadilhas ✅ feito

**Objetivo:** carregar as 17 folhas do vocabulário fechado e os 169 `SUBS` do SIGMINE, tratando
toda célula malformada explicitamente.

**Feito**, com três divergências do que o `GOAL.md` §6.3 afirma — as duas primeiras mudam o
carregador, a terceira muda o que o patch 9 pode supor:

1. **`#ERROR!` não é *shared string* — é célula de fórmula com resultado em cache.** O §6.3 diz
   `t="s"`; o XML diz
   `<c r="D20" t="str"><f> 20.000 &lt; 200.000 (redação…)</f><v>#ERROR!</v></c>`. A consequência é
   maior que a etiqueta: **com o default do openpyxl (`data_only=False`) a célula devolve o texto da
   fórmula**, que não contém `#ERROR!` e não casa `faixa não expressa` — a sentinela não dispara e o
   porte-lixo entra como válido. Detectar por sentinela de texto é necessário e **não é suficiente**.
   Daí a leitura com `data_only=True` mais uma segunda abertura com `data_only=False`: célula
   mapeada que seja fórmula precisa de valor em cache **e** de resultado sentinela, senão é
   `RefLoadError`. Sem essa guarda, um XLSX regravado por ferramenta que não avalia fórmula
   devolveria `None`, que a camada de porte trataria como faixa ausente e seguiria em frente com o
   aviso de sempre, escondendo que o arquivo mudou.
   De passagem, a fórmula mostra o que a corrupção comeu: comparada a B4.6
   (`< 20.000` / `>= 20.000 < 300.000` / `>= 300.000`), a faixa ` 20.000 < 200.000` que sobrou em
   PEQUENO é a faixa **MÉDIO** deslocada. Não é erro de cálculo, é dado deslocado, e não se sabe
   para onde — o que confirma `None` nas duas colunas por um motivo melhor que "a célula deu erro".
2. **As substâncias ambíguas são 13, não 10.** Duas causas independentes. `caulim` estava escondido
   atrás da chave-lixo `caulim dentre outros`, produzida por um corte de cauda que exige vírgula
   antes de `Dentre` — B4.1 escreve `"…, Ilita, Caulim Dentre Outros"` **sem** vírgula. A colisão
   importa: B3.3 é Caulim sozinho (poluidor **A**, Classe 4/5/6) e B4.1 é Caulim junto das argilas
   (poluidor **M**, Classe 2/3/5). E `quartzo`/`quartzito` só não colidiam por causa do `s` do
   plural: `Quartzo` está em B4.2 (vidro/óptica) e `Quartzos` em B3.5 (revestimento); `Quartzito` em
   B4.4 (industrial) e `Quartzitos` em B3.4 (britagem). Sob dobra exata `"Quartzo"` resolveria
   sozinho para B4.2 e nunca chegaria ao LLM — o mesmo defeito do Granito, sem o alarme. Decidido
   nesta sessão: `chave_substancia()` desingulariza o `s` final da **última** palavra, com mais de 3
   letras. Medido nas 130 chaves cruas, isso funde exatamente esses 2 pares e nenhum outro, não
   sobra chave terminada em `s`, e nos 169 `SUBS` não funde nada. Resultado: 128 chaves, 13 ambíguas.
3. **Os dois vocabulários são largamente disjuntos.** Só **69 dos 169** `SUBS` existem no índice do
   Anexo IV (56 sem a desingularização). O SIGMINE nomeia minério e rocha (`MINERIO DE FERRO`,
   `MIGMATITO`, `GRANODIORITO`), o Anexo IV nomeia elemento e mineral. Não é defeito de nenhum dos
   dois e não é deste patch resolver — são duas buscas distintas no patch 9, `substancia_raw` contra
   `indice_substancias` e `mineral` contra `indice_minerais` — mas fica travado por teste para que
   o patch 9 não seja desenhado supondo sobreposição que não existe. De passagem: o SIGMINE já
   codifica uso em 6 valores (`GRANITO P/ REVESTIMENTO`, `QUARTZITO P/ REVESTIMENTO`,
   `AREIA P/ VIDRO`…), o que é sinal a favor da desambiguação por uso do patch 9.

Dois desvios menores de forma. `research_pipeline/errors.py` foi criado só para `RefLoadError`:
`refs.py` importa `vocab.py` e os dois precisam da mesma exceção — deixá-la em `refs.py` fecharia um
ciclo de import e duplicá-la faria `except RefLoadError` pegar uma das duas conforme o caminho do
import, que é pior que o ciclo. `refs.py` a reexporta, então
`from research_pipeline.refs import RefLoadError` continua valendo e é o mesmo objeto. E as colunas
da planilha são localizadas pelo **texto** do cabeçalho, não por posição: coluna inserida à esquerda
não desloca a leitura, e coluna renomeada falha alto nomeando o cabeçalho que existe.

A divisão erro × aviso ficou assim, e não é arbitrária: célula malformada **conhecida** (as
sentinelas) e divergência da matriz do Art. 109 viram aviso, porque a publicação oficial é a fonte e
não vai ser corrigida; qualquer outra coisa fora de forma é `RefLoadError`, porque significa que o
arquivo mudou. Por isso a carga do vocabulário entra em `load_reference_data` junto das tabelas, e
não sob demanda — o AC8 é *falhar antes de gastar*, e um `BA.dbf` truncado descoberto no `normalize`
já custou o relatório. Medido: DBF 0,29 s, XLSX 0,05 s, tabelas 0,011 s.

40 testes novos, 115 no total, todos passando. Suíte verificada por mutação: trocar `data_only=True`
por `False` quebra 5 e derruba 22 por erro de fixture (a guarda de fórmula pega o texto da fórmula
como resultado não-sentinela); remover a desingularização quebra 9; exigir vírgula no corte de cauda
quebra 5. O `test_vocabularios_vazios_ate_o_patch_4` do patch 3 foi substituído pela afirmação
positiva — ele existia para travar o contrato deste patch e era para morrer aqui. O
`_raiz_corrompida` de `test_refs.py` ganhou um symlink de `data_source/`: 13 MB que não faz sentido
copiar 16 vezes para corromper um campo de JSON.

O `GOAL.md` §6.3 **não** foi reaberto (não é escopo deste patch), como o §7.2 no patch 3. Fica
registrado aqui: a etiqueta `t="s"` está errada, e a lista de dez colisões está incompleta.

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

**Verificar:** `python -m research_pipeline.vocab` imprime `17 tipologias (10 A / 7 M / 0 P)`,
`128 chaves de substância, 13 ambíguas`, `169 minerais (69 casam com o Anexo IV)` e os 2 avisos.
Mais `python -m pytest research_pipeline/tests/test_vocab.py`, afirmando: 17 tipologias e as 6
linhas de grupo excluídas; `tipologias["B4.2"].porte_pequeno is None` com os 2 avisos;
`indice["granito"] == ("B3.4", "B3.5")`; `substancias_ambiguas` igual às **13** colisões medidas
(snapshot congelado, para que mudança de vocabulário quebre alto); `len(minerais) == 169`;
`read_dbf` devolve 31.858 linhas e as 12 colunas esperadas.

**Não faz ainda:** nenhuma *resolução* substância→tipologia (patch 9). Aqui só se constrói o índice
e se prova que as armadilhas estão tratadas.

---

## Patch 5 — Derivação mecânica de aliases ✅ feito

**Objetivo:** a camada que faz `CONSORCIO` casar com `Consórcio`, como funções puras sem I/O.

**Feito**, como planejado, sem divergência de `GOAL.md`.

Medido nos 29 nomes reais de consórcio: exatamente **14** trazem `" - SIGLA"` (uma delas via o
mojibake `\x96` do CISUDOESTE, não `"-"`) — as outras 15 não têm separador e a sigla fica `None`.
A cascata de `PREFIXOS_FRENTE` descasca o boilerplate (`CONSORCIO`, `PÚBLICO`/`INTERFEDERATIVO`,
`INTERMUNICIPAL`, `DE DESENVOLVIMENTO SUSTENTÁVEL`, `DO TERRITÓRIO [DE IDENTIDADE]`, `DE`/`DO`
soltos, mais o sufixo `DA BAHIA`/`BAIANO`) e sobra a `chave_curta`: `9742` → `sisal`, `8108` →
`portal do sertao`, `29308` → `bacia do rio corrente`, entre outras. Nenhum item para `"da"` solto
na cascata — nos 29 nomes reais ela só aparece dentro do que importa (`"da costa do
descobrimento"`) ou no sufixo composto `"da bahia"`, nunca como boilerplate isolado; forçá-la
cortaria nome de verdade.

A ordem da cascata é carga estrutural, não estética: `"do territorio"` tem de ser tentado **antes**
de `"do"` solto, senão o `"do"` sozinho consome a primeira metade da frase e `"territorio"` sobra
grudado no que deveria ser a chave curta — confirmado por mutação (ver abaixo).

Sigla sai do nome **cru**, nunca do dobrado — `fold()` destrói a caixa alta que a distingue do
resto do nome, e é o mesmo motivo pelo qual o `GOAL.md` §7.2 já registrava essa regra para o alias
de município (ela só ficou explícita agora para o de consórcio). `SEPARADOR_SIGLA` inclui o mesmo
conjunto de traços/mojibakes que `common/text.py` trata do lado do nome (`\x96`, `\x97`, en/em-dash),
porque a sigla vive do outro lado do mesmo separador.

`derive_municipio_aliases` devolve `{fold(nome)}` mais a variante sem conectivo (`de`/`do`/`da`)
quando ela difere — `"Barra do Choça"` vira `{"barra do choca", "barra choca"}`. `"Dias d'Ávila"`
gera só uma forma: o apóstrofo já foi absorvido por `fold()` antes de virar token, então não sobra
`d` solto para remover — o `"d"` na lista de conectivos é defesa contra uma fonte hipotética que
escreva `"Dias D Ávila"` com espaço, não algo exercitado pelos 417 nomes atuais.

`config/aliases.yaml` recebeu o único override real, migrado (copiado, não removido) de
`scripts/lib/municipios_ba.py:67`: `2928505 → ["santa teresinha"]`. O motivo, como o patch 4 já
tinha confirmado para os nomes de município em geral: **não** é divergência GAC × IBGE — as duas
fontes escrevem `Santa Terezinha`, com z. É alias para a grafia com **s** de texto de terceiro.

27 testes novos, 142 no total, todos passando. Mutação: extrair a sigla do nome dobrado em vez do
cru quebra 5 testes; remover `\x96`/`\x97` de `SEPARADOR_SIGLA` quebra 3 (inclusive o de
CISUDOESTE); inverter a ordem `"do"` / `"do territorio"` na cascata quebra a chave curta de `9742`
(`"territorio do sisal"` em vez de `"sisal"`); remover a variante sem conectivo de
`derive_municipio_aliases` quebra os casos parametrizados com `de`/`do`.

**Não faz ainda:** nenhum matching de fato (patch 6) — aqui só se deriva o conjunto de grafias
possíveis. `load_overrides` não é consumido por ninguém ainda; existe para o patch 6 somar aos
aliases derivados.

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
  `2928505: ["santa teresinha"]`. **Atenção ao motivo, que o `GOAL.md` §7.2 registra errado:** não é
  divergência GAC × IBGE — os dois escrevem `Santa Terezinha`, com z (medido no patch 3, 0
  divergências nos 417). O alias existe para a grafia com **s** que aparece em texto de terceiro.
- **criar** `research_pipeline/tests/test_aliases.py`

**Verificar:** `python -m research_pipeline.aliases` imprime tabela de 29 linhas
(`id | sigla | chave_curta | nome`); `python -m pytest research_pipeline/tests/test_aliases.py`
afirma: exatamente **14** consórcios com sigla; `29302 → CIVALERG`; `45429 → CISUDOESTE`
(separador `\x96`); `9742 → CONSISAL`; `chave_curta` de `9742` é `"sisal"`, de `8108` é
`"portal do sertao"`, de `29308` é `"bacia do rio corrente"`.

---

## Patch 6 — Matcher determinístico (o pré-filtro barato) ✅ feito

**Objetivo:** resolver nomes a ids canônicos com método + confiança, **sem nenhum LLM**.

**Feito**, como planejado, com uma correção ao exemplo do plano e um achado estrutural.

**A ordem exato → alias → fuzzy exigiu particionar a sigla também do lado da consulta.** O nome
oficial de 14 consórcios traz a sigla colada (`"...DA BAHIA - COTEMESB"`). Comparar `fold(raw)`
puro contra `item.folded` (que já está sem sigla, herdado do patch 5) fazia esses 14 nomes
oficiais caírem em `alias` em vez de `exato` — o próprio nome cru não batia consigo mesmo.
Corrigido rodando `derive_consorcio_aliases(raw)` também na consulta e comparando o `folded`
resultante (sem sigla dos dois lados). Confirmado por mutação: reverter para `fold(raw)` puro
quebra `test_todos_os_29_consorcios_match_exato` nos 14 casos com sigla.

**O exemplo `"Caetite" → 2905404 fuzzy ≥ 0.90` do rascunho deste patch estava errado em dois
pontos**, medido contra os dados reais: `2905404` é Cairu, não Caetité (`2905206`); e `fold()`
remove acento dos dois lados, então `"Caetite"` sem acento e `"Caetité"` oficial dobram para a
mesma string — é `exato`, não `fuzzy`. Substituído por `"Caetitte"` (erro de letra, não de
acento), que mede `0.933` contra `2905206` e exercita o caminho fuzzy de verdade.

As quatro formas curtas do teste manual (`"Consórcio Bacia do Paramirim"` → `14618`, `"Consórcio
Portal do Sertão"` → `8108`, `"Consórcio Piemonte do Paraguaçu"` → `29322`, `"Consórcio do Vale do
Rio Gavião"` → `29302`) resolvem via `alias`: cada uma reduz, pela mesma cascata do patch 5, à
`chave_curta` do nome oficial — nenhuma bate o nome inteiro nem precisa do fuzzy.

Decisão 16 medida: `"Bacia do Paramirim (Região)"` (nome de território de consórcio, não de
município — linha real do PROMPT 2) mede `0.58` contra o município mais próximo, abaixo do piso
de `0.60` → `municipio_id=None`, `metodo="nenhum"`, `candidatos` continua com o top-5. Decisão 4
medida: consórcio nunca zera — até lixo puro (`"xxxxxxxxxxxxxxxxxxxx"`) recebe o mais próximo,
`metodo="fuzzy"`, porque `consorcio_fuzzy_minimo` é `0.0` de propósito.

28 testes novos, 170 no total, todos passando. Mutação, 4 pontos: reverter a partição de sigla no
lado da consulta quebra o `exato` dos 14 nomes oficiais com sigla; desligar o piso do município
quebra o `nenhum` de `"Bacia do Paramirim (Região)"`; zerar o delta de ambiguidade quebra
`"Santa Rita"` (`ambiguo=True` esperado); introduzir um piso no consórcio quebra o "nunca vira
nenhum" para lixo puro.

**Não faz ainda:** nenhum uso do `Match` fora deste módulo — schemas (patch 7) e `normalize`
(patch 9) são quem de fato consome `id`/`metodo`/`confianca`/`ambiguo`.

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
os 417 nomes exatos → `exato`, `1.0`; os 29 nomes exatos → `exato`; `"Caetitte" → 2905206` `fuzzy ≥ 0.90`;
`"CIVALERG" → 29302` `alias`; `"Consórcio Bacia do Paramirim" → 14618`;
`"Consórcio Portal do Sertão" → 8108`; `"Consórcio Piemonte do Paraguaçu" → 29322`;
`"Consórcio do Vale do Rio Gavião" → 29302` (as quatro são as strings reais do teste manual);
`"Santa Teresinha" → 2928505` via override; e
**`"Bacia do Paramirim (Região)"` → `municipio_id=None`, `metodo="nenhum"`** — linha real do
PROMPT 2 que não é município.

---

## Patch 7 — Schemas Pydantic + validador duro ✅ feito

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

**Feito.** `schemas.py` (contrato do §8), `nodes/validate.py` (`validate_licencas`) e
`tests/test_validate.py`. 56 testes novos, **226 no total**, todos passando. Três achados e uma
decisão que o plano acima não previa:

1. **`date.fromisoformat` sozinho não valida data ISO no Python 3.12.** Medido:
   `"20250204"` devolve `date(2025, 2, 4)` (forma compacta) e `"2025-W05-1"` devolve
   `date(2025, 1, 27)` (data-semana ISO) — as duas viram datas plausíveis em silêncio, e o §6.1
   pede `AAAA-MM-DD`. `_data_iso` casa `\d{4}-\d{2}-\d{2}` **antes** e continua chamando
   `fromisoformat` depois, porque só ele pega `"2025-02-30"`. Sem o regex, `"20250204"` entraria
   como 4 de fevereiro.
2. **`Renovação` × `Renovacao`, divergência §5 × este plano.** O §5 manda o prompt de pesquisa
   pedir `Renovação`, com til; o plano declarava o `Literal` sem. Resolvido com o canônico em ASCII
   (`"Renovacao"`) mais um normalizador `mode="before"` que dobra caixa e acento e mapeia as 6
   formas conhecidas — mesma classe do `fold()` do patch 6, mecânica e fechada.
   `"Licença Unificada"` continua erro duro. O `GOAL.md` fica **anotado, não reaberto**, como o
   §7.2 no patch 3 e o §6.3 no patch 4.
3. **O exemplo de licença do §8 fecha com as referências reais**, então virou teste literal em vez
   de fixture inventada: `2907558` é Caturama, o consórcio cadastral dela é o `14618` com o nome
   idêntico ao do §8, `B3.1` existe com aquele nome e potencial `M`, e `"AREIA"` está entre os 169
   `SUBS`. `test_exemplo_do_goal_8_...` exige zero erro e zero aviso; se o schema divergir do
   documento, quebra.

Decisões de forma que o plano deixou em aberto: `verificado` é `Literal[False]`, não `bool` (o §8
diz *sempre*, e travar no tipo custa menos que uma regra); `total_por_licenciado_por` é submodelo e
não `dict[str, int]`, para que as três chaves existam mesmo zeradas (AC5);
`MetodoMatch` e `PotencialPoluidor` passam a morar em `schemas.py` e são **importados** por
`matcher.py` e `vocab.py` (dois `Literal` iguais em dois módulos divergem em silêncio; o
`POTENCIAIS_VALIDOS` do `vocab.py` agora é `get_args` do literal). `nivel_uniforme` exige mínimo de
**5 linhas** e usa o total de linhas válidas como denominador: com uma linha só, 100% de
uniformidade é trivial, e contar só as linhas com nível daria 100% para um lote de 8 em que uma
única traz nível.

`municipio_nao_resolvido` **não** entra aqui — quem o emite é o `normalize` (§6.2), patch 9. O nó
LangGraph `validate(state, config)` e o laço de reparo também não: patch 11, quando existir grafo.

Mutação, todas conferidas quebrando teste nomeado: tirar o regex de data
(`test_data_concessao_rejeitada[20250204]` e `[2025-W05-1]`), trocar `extra="forbid"` por
`"ignore"` (`test_campo_desconhecido_e_erro_duro`), transformar `consorcio_id` +
`municipio_proprio` em erro duro (`test_consorcio_com_municipio_proprio_e_valido`, a não-regra do
§6.4) e baixar o mínimo do `nivel_uniforme` de 5 para 1
(`test_nivel_uniforme_nao_dispara_abaixo_do_minimo`). Esta última só passou a quebrar depois de o
teste trocar `NIVEL_UNIFORME_MINIMO - 1` por tamanhos literais — escrito em função da constante,
ele a seguia e passava com qualquer valor dela.

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
  substância é **renderizada em tempo de execução a partir de `substancias_ambiguas()`** (patch 4),
  para que as **treze** colisões recebam a instrução por *uso*, não só Granito, com "na dúvida
  devolva `null` com justificativa". Ver o patch 4: são 13 e não as 10 do §6.3, e o uso declarado
  na planilha não cobre todas — 6 têm cauda de uso dos **dois** lados (`granito`, `sienito`,
  `quartzo`, `quartzito`, `feldspato`, `moscovita`), 4 só de um (`calcita`, `caulinita`, `cianita`,
  `turmalina`) e **3 de nenhum** (`caulim`, `diatomita`, `selenio`). Nessas três o prompt não tem
  uso a oferecer e só resta o `null`.
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
| 0 | Corrigir GOAL.md → v1.4 ✅ | não | revisão do diff |
| 1 | Andaime: deps, `.env`, pytest ✅ | não | `pip install -r requirements.txt` + imports |
| 2 | `common/`: `fold()` + `read_dbf()` ✅ | não | `pytest common/tests` (paridade 417) |
| 3 | Carregador + **AC8** ✅ | não | `python -m research_pipeline.refs` |
| 4 | Vocabulários + 2 armadilhas XLSX ✅ | não | `python -m research_pipeline.vocab` |
| 5 | Aliases mecânicos ✅ | não | `python -m research_pipeline.aliases` |
| 6 | Matcher determinístico ✅ | não | `pytest test_matcher.py` |
| 7 | Schemas + validador ✅ | não | `pytest test_validate.py` |
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
