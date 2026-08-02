# Motor de enquadramento licenciatório

**Hackathon+ Mineração 2026 · Escopo A — Licenciamento**

Dada uma poligonal minerária na Bahia, o sistema responde **quem licencia**
(União, Estado ou Município), **por qual trilha**, **em que prazo legal** e
**com base em qual dispositivo** — ou declara `INDETERMINADO` e gera o pedido de
acesso à informação que falta, em vez de chutar.

> Em construção. Este README é atualizado a cada escopo entregue; as seções
> marcadas 🚧 ainda não têm o conteúdo final.

---

## Estado atual

| Escopo | Situação |
| --- | --- |
| **0 — Fundação** | ✅ repo, schemas congelados, fixtures, pipeline, licença |
| **A — SIGMINE e processo ANM** | ✅ P0 completo (A.1–A.8) · 🚧 A.9 (P1), A.10 (P2) |
| **B — Formulário** | ✅ P0 completo (B.1–B.8) |
| **C — Base de regras dos 10 municípios** | 🚧 caminho crítico, trabalho documental |
| **D — Motor de match** | ⚠️ stub provisório em `frontend/src/lib/motor.ts` — assinatura final, corpo descartável (D.2–D.6 já utilizáveis) |
| **E — Análise comparativa** | 🚧 não iniciado |
| **F — Shell e interface** | 🚧 tela provisória de banco de provas |
| **G — Integração com o gerador LAI** | 🚧 não iniciado |
| **H — Entregáveis do regulamento** | 🚧 licença e README em andamento |

---

## Como rodar

Tudo roda **offline**, com a rede desligada. Nenhuma chamada externa em tempo
de execução: os dados geoespaciais já vêm processados no repositório.

```bash
# aplicação
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # bundle estático em frontend/dist/, servível de qualquer diretório
```

```bash
# pipeline de dados — só é necessário para regenerar os GeoJSON
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/prep.py
```

`prep.py` é idempotente: lê exclusivamente os brutos de `data_source/` e
reescreve tudo o que está em `frontend/public/data/`. Para mudar o recorte de
municípios, edite `pipeline/municipios.py` e rode de novo — nada mais muda.

---

## Fontes e procedência

Todo dado exibido na interface carrega fonte e data de consulta. As fontes
primárias estão versionadas **em bruto** neste repositório, para que a base seja
reproduzível sem depender de nenhum site de terceiro continuar no ar.

| Fonte | Arquivo no repo | URL de coleta | Data de coleta |
| --- | --- | --- | --- |
| **SIGMINE / ANM** — processos minerários da Bahia | `data_source/BA-shapefile/BA.shp` (+ `.dbf .shx .prj .cpg .sbn .sbx .shp.xml`) | https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS/BA.zip | **2026-07-31, 23h47** |
| **IBGE** — Malha Municipal Digital 2025, Bahia | `data_source/Malha municipal IBGE-BA/BA_Municipios_2025.shp` (+ auxiliares) | https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html ⚠️ **a confirmar pelo coletor** | **2026-02-03** |
| **Resolução CEPRAM 4.420/2015** — Anexo Único, grupo de mineração | `data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx` | 🚧 registrar em C.1 | 🚧 |
| **Lei 6.567/1978** — regime de licenciamento mineral | `data_source/L6567.pdf` | 🚧 registrar em C.4 | 🚧 |
| **Lei Complementar 140/2011** — competências ambientais | `data_source/Lcp 140.pdf` | 🚧 registrar em C.4 | 🚧 |
| **Habilitação municipal (GAC)** | 🚧 dossiê de C.2 | 🚧 | 🚧 |

> As duas datas acima são o carimbo de tempo do arquivo no disco de quem
> baixou, não uma data digitada à mão.

Condições de uso de terceiros: a Malha Municipal Digital do IBGE está sujeita à
Nota Metodológica citada em `data_source/Malha municipal IBGE-BA/LEIA-ME.txt`.

---

## Arquitetura

```
data_source/                    brutos, versionados, nunca editados à mão
  BA-shapefile/                   SIGMINE — 31.858 poligonais da Bahia
  Malha municipal IBGE-BA/        417 municípios
pipeline/
  municipios.py                   o recorte da amostra — única fonte da lista
  prep.py                         A.2 · A.3 · A.4 · A.5 · A.7
  requirements.txt
frontend/
  public/data/                    artefatos gerados, consumidos em runtime
  src/lib/schemas.ts              ⚠️ CONTRATO CONGELADO (0.2)
  src/lib/processos.ts            índice e normalização de busca (A.5)
  src/data/viradas.ts             as 4 fixtures da demo (A.8)
  src/lib/fatos.ts                formulário → FactBase (fronteira D.1)
  src/lib/motor.ts                ⚠️ STUB do Escopo D — assinatura definitiva
  src/lib/porte.ts                faixas, fronteiras e escala do controle (B.4)
  src/lib/validacao.ts            pendências do formulário (B.7)
  src/lib/vocabulario.ts          fases ANM e substâncias do recorte (B.2/B.3)
  src/state/formulario.tsx        estado global único (B.6)
  src/data/fixtures.ts            dado provisório dos 4 schemas (0.3)
  src/parecer/                    a tela — cabeçalho de veredito, mapa,
                                  caracterização e painel do parecer (F)
documentation/BACKLOG.md        o plano
```

### Artefatos gerados por `prep.py`

| Arquivo | Conteúdo | Tamanho |
| --- | --- | --- |
| `municipios10.geojson` | 10 feições, código IBGE e nome | 74 KB |
| `processos.geojson` | 2.585 processos com `municipios[]` e `cruza_divisa` | 3,6 MB |
| `indice_processos.json` | índice de busca, sem geometria | 588 KB |
| `candidatos_divisa.json` | 746 processos que cruzam divisa — insumo de A.7 | 453 KB |
| `metadata.json` | parâmetros, contagens e procedência da execução | 2 KB |

---

## Premissas declaradas

1. **Recorte de 10 municípios.** A base de habilitação municipal é auditada à
   mão, com fonte e data por linha. Fora da amostra o sistema devolve
   `INDETERMINADO` e gera o pedido LAI — a limitação é funcionalidade, não erro.
   Os 10: Jacobina, Jaguarari, Maracás, Campo Formoso, Pojuca, Caetité,
   Brumado, Itagibá, Andorinha e Santaluz.

2. **O município é derivado, não lido.** O shapefile do SIGMINE não traz
   atributo de município confiável. Cada poligonal é intersectada contra as 417
   feições da malha IBGE e recebe `municipios[]` com a proporção de área em
   cada uma.

3. **Área calculada em projeção equivalente.** Proporção de área medida em
   graus decimais dá número errado. O cálculo usa uma cônica de área igual
   (Albers, parâmetros IBGE); a string PROJ está em `pipeline/prep.py`.

4. **Fatias de borda abaixo de 0,5% da poligonal *e* de 0,5 ha são
   descartadas.** Dois shapefiles de origens diferentes produzem lascas de
   alguns metros quadrados nas divisas; sem esse corte, quase todo processo de
   borda apareceria falsamente como cruzando divisa.

5. **Processo é a unidade, não o polígono.** Quando a área outorgada é
   descontínua, o SIGMINE traz várias feições com o mesmo número. Elas são
   dissolvidas — 370 feições viraram partes de processos multiparte.

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

- A base cobre **10 dos 417 municípios** baianos. Consultas fora da amostra
  retornam `INDETERMINADO`.
- O SIGMINE é um retrato da data de coleta acima. Processos protocolados depois
  não estão na base.
- 784 registros do shapefile trazem `UF = DADO NÃO CADASTRADO`. Não foram
  descartados: a incidência municipal é decidida pela geometria, não pelo
  atributo.
- 23 geometrias inválidas do bruto foram corrigidas por `make_valid`, o que
  altera minimamente a fronteira dessas poligonais.
- A malha municipal é simplificada a 8% (Visvalingam, com preservação de
  topologia) para caber no orçamento de 300 KB. As poligonais dos processos
  **não** são simplificadas.
- Os dados em `frontend/src/data/fixtures.ts` são **provisórios e não conferidos**.
  Estão marcados com a constante `FIXTURE` e devem sumir antes do congelamento.
- 🚧 Fundamentos ainda não conferidos contra a fonte primária aparecem marcados
  como pendentes na interface (C.6).

---

## Licença

[CC BY-NC 4.0](LICENSE) — uso comercial vedado, conforme item 10.4 do
regulamento. Os brutos de terceiros em `data_source/` mantêm as condições de
suas fontes originais.
