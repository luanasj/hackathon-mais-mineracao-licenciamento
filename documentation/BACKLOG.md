# Backlog — Motor de Enquadramento Licenciatório

**Hackathon+ Mineração 2026 · MVP com recorte de 10 municípios**
Congelamento de escopo: 02/08, 02h30 · Envio: 02/08, 13h30 (prazo oficial 14h30)

---

## Como ler este documento

**Dificuldade**
🟢 Baixa — execução direta, sem incógnita. Qualquer pessoa do time faz.
🟡 Média — exige decisão técnica, mas o caminho é conhecido.
🔴 Alta — depende de fonte externa ou de volume manual. **Começa primeiro.**

**Prioridade**
`P0` entra na demo · `P1` se sobrar tempo · `P2` só aparece no slide de roadmap

**⚠️ DESTAQUE** — task que, se atrasar, arrasta o projeto inteiro. Tem dono nomeado e checkpoint próprio.

---

## 1. A decisão que muda tudo: o recorte de 10 municípios

Reduzir de 417 para 10 municípios não é uma concessão de escopo. É uma **mudança de natureza do problema**: sai de curadoria de dado inviável e entra em base de conhecimento auditada à mão, com fonte e data de consulta em cada linha. Isso libera as horas que estavam presas em coleta e joga tudo em motor, demonstração visual e prova de análise.

Três consequências diretas, e todas favorecem a banca:

1. **Cada linha da base tem procedência.** "Consultamos o GAC para estes 10, na data X, e aqui está o print" é infinitamente mais defensável que uma varredura automatizada de 417 portais com qualidade desconhecida.
2. **Fora da amostra, o sistema devolve INDETERMINADO e gera o pedido LAI** (Escopo 3, já construído). A limitação vira funcionalidade, com o mesmo argumento que já sobreviveu ao teste de honestidade.
3. **A demo fica determinística.** Nada de "vamos torcer para o município que o jurado digitar estar na base".

### 1.1 Critério de seleção — cobertura de regra, não fama

Os 10 municípios **não são escolhidos por importância mineral**. São escolhidos como *fixtures*: cada um precisa exercitar um ramo diferente do motor. Se os 10 mais óbvios não cobrirem todos os ramos, troca-se um.

| Ramo da regra que precisa de cobertura | Por que é indispensável |
| --- | --- |
| Município habilitado, com a tipologia mineral delegada | Caminho feliz → **MUNICIPAL, definida** |
| Município habilitado, mas sem aquela tipologia no nível dele | Prova que o motor não confunde competência abstrata com habilitação concreta → **ESTADUAL** |
| Município sem habilitação | → **ESTADUAL** por caminho diferente do anterior |
| Município sem evidência pública de habilitação | → **INDETERMINADO** → aciona o Escopo 3 |
| Substância nuclear (urânio — Caetité) | Gatilho federal absoluto → **UNIÃO**, ignora tudo abaixo |
| Poligonal cruzando divisa entre dois municípios com status divergente | → **CONDICIONAL / INDETERMINADO**, o caso que ninguém trata |

**Regra de método, inegociável:** primeiro se levanta o dado real de cada município, depois se confere a cobertura. Nunca o contrário. Se a distribuição real deixar um ramo descoberto, acrescenta-se um 11º município — não se ajusta o dado ao ramo desejado. Um jurado que peça a fonte de uma linha precisa recebê-la na hora.

### 1.2 Lista de partida

Municípios de região mineral, a confirmar contra a disponibilidade real de dado no GAC:

Jacobina · Jaguarari · Maracás · Campo Formoso · Pojuca · Caetité · Brumado · Itagibá · Andorinha · Santa Luz

Perfis conhecidos e úteis ao roteiro: Jacobina (ouro, maior produtor mineral do estado) · Jaguarari (cobre) · Maracás (vanádio) · Campo Formoso e Pojuca (cromo e ferroligas) · Itagibá (níquel) · Caetité (urânio e ferro — **o gatilho federal**) · Brumado (magnesita). Andorinha e Santa Luz entram como preenchimento de ramo e devem ter o perfil confirmado.

---

## 2. A espinha da demonstração: um formulário, quatro viradas

Este é o argumento central do produto e precisa reger as prioridades do backlog. Na mesma tela, mudando **um campo por vez**, a resposta vira quatro vezes:

| # | Mudança de um único campo | Resposta salta para | O que prova |
| --- | --- | --- | --- |
| 1 | Sondagem de pesquisa, pequeno porte, em município habilitado | **MUNICIPAL — definida** | Caminho feliz, com fundamento citado |
| 2 | Arrasta o porte de 40.000 para 150.000 t/ano | **ESTADUAL — INEMA** | Existe função de porte real, e o limiar é exibido |
| 3 | Troca a substância para urânio (Caetité) | **UNIÃO — IBAMA** | Precedência federal absorve tudo abaixo |
| 4 | Escolhe a poligonal que cruza a divisa municipal | **INDETERMINADO** → gera pedido LAI | O sistema não chuta, e a limitação vira ação |

Cabe em 60 segundos e acontece **antes do minuto 1** do pitch. Nenhuma explicação necessária: a banca vê o motor funcionando.

**Consequência para o backlog:** toda task que serve a essas quatro viradas é P0. Toda task que não serve é P1 até prova em contrário.

---

## 3. Mapa de dependências

```
ESCOPO 0 — Fundação (contratos de dado + repo + pipeline)
     │
     ├──────────────┬────────────────┬─────────────────┐
     ▼              ▼                ▼                 ▼
ESCOPO A        ESCOPO C         ESCOPO B          ESCOPO F
SIGMINE /     Regras dos 10    Formulário         Shell da UI
processo ANM   municípios                          (paralelo)
     │              │                │                 │
     └──────────────┴────────┬───────┴─────────────────┘
                             ▼
                        ESCOPO D
                   Motor de match (FactBase → parecer)
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
            ESCOPO E                ESCOPO G
       Análise comparativa      Integração Escopo 3
        e gráficos                (gerador LAI)
                 │                       │
                 └───────────┬───────────┘
                             ▼
                        ESCOPO H
                  Entregáveis do regulamento
```

**Caminho crítico:** 0 → C → D → E. O Escopo C é o único que não pode ser paralelizado com código, e é o mais pesado. Ele começa primeiro e tem duas pessoas.

**Como quebrar o bloqueio:** o Escopo 0 define e congela os **schemas JSON** em 30 minutos. A partir daí, o motor (D) e a interface (F) trabalham contra fixtures de mentira enquanto C produz o dado de verdade. Sem isso, três pessoas ficam paradas esperando um PDF ser transcrito.

---

## ESCOPO 0 — Fundação

**Objetivo:** deixar todo mundo trabalhando em paralelo em 90 minutos.
**Dificuldade:** 🟡 Média · **Esforço:** 2,5h · **Dono:** integrador

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Repositório, Vite + React + TS + Tailwind + shadcn/ui, deploy estático configurado | `npm run build` gera bundle servível offline; primeiro commit com autoria de ≥2 membros | 🟢 | 0,5 | P0 |
| 0.2 | **Congelar os 4 schemas JSON**: `Tipologia`, `MunicipioHabilitacao`, `Regra`, `Parecer` | Arquivo `schemas.ts` com os tipos; todos os escopos importam dele; ninguém inventa campo depois | 🟡 | 0,75 | P0 |
| 0.3 | Fixtures falsas para cada schema — 2 tipologias, 2 municípios, 3 regras, 1 parecer | Motor e front rodam ponta a ponta com dado mentiroso antes de o dado real existir | 🟢 | 0,5 | P0 |
| 0.4 | Pipeline de pré-processamento em Python/GeoPandas, versionado no repo | `python prep.py` regenera todos os GeoJSON a partir dos brutos | 🟡 | 0,75 | P0 |
| 0.5 | `LICENSE` (aberta com restrição comercial) e esqueleto do `README` | Ambos no repo antes de qualquer feature | 🟢 | 0,25 | P0 |

> **Ordem obrigatória:** 0.2 antes de 0.3, e 0.3 antes de qualquer linha de motor ou de interface. O contrato vem antes do dado.

---

## ESCOPO A — Busca por processo ANM e poligonal SIGMINE

**Objetivo:** o usuário digita `870.123/2019` e a poligonal real da área aparece no mapa, com substância, fase e titular já preenchidos.
**Dificuldade:** 🟡 Média · **Esforço:** 4h · **Risco:** dependência de download externo
**Valor:** é o momento visual mais forte da demo e o maior redutor de fricção do formulário — três campos deixam de ser perguntados porque o SIGMINE já os traz.

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| **A.1** | ⚠️ **DESTAQUE — baixar o shapefile SIGMINE da Bahia AGORA e commitar o bruto** | Arquivo no repositório, com data e URL de coleta registradas no README | 🔴 | 0,5 | P0 |
| A.2 | Baixar malha municipal IBGE-BA e recortar aos 10 municípios | GeoJSON com 10 feições, código IBGE e nome, ≤ 300 KB | 🟢 | 0,5 | P0 |
| A.3 | *Spatial join* SIGMINE × malha para derivar o município de cada processo | Cada feature carrega `municipios[]` com proporção de área — o shapefile **não** traz esse atributo confiável | 🟡 | 1,0 | P0 |
| A.4 | Filtrar aos processos que incidem nos 10 municípios, simplificar topologicamente, exportar | GeoJSON ≤ 4 MB, topologia preservada, atributos `processo · fase · substancia · titular · area_ha` | 🟡 | 0,75 | P0 |
| A.5 | Índice de busca `processo → feature`, com normalização da entrada | `870123/2019`, `870.123/2019` e `8701232019` resolvem para o mesmo registro | 🟢 | 0,5 | P0 |
| A.6 | Componente de busca com autocomplete e estado de "não encontrado" → oferece desenho ou ponto+raio | Nunca deixa o usuário em beco sem saída | 🟢 | 0,75 | P0 |
| **A.7** | ⚠️ **Localizar um processo real cuja poligonal cruze divisa municipal** | Query sobre A.3: `municipios.length > 1`. É o insumo da 4ª virada da demo | 🟡 | 0,25 | P0 |
| A.8 | Fixar 4 processos como fixtures embarcadas, uma por virada da demo | Os 4 carregam mesmo se o índice inteiro falhar | 🟢 | 0,25 | P0 |
| A.9 | Desenho de polígono e ponto+raio com buffer **geodésico** | Círculo em graus decimais é elipse deformada — usar `turf.circle` em km | 🟡 | 0,5 | P1 |
| A.10 | Upload de KML/SHP pelo usuário | — | 🟡 | 2,0 | P2 |

> **A.1 é a primeira task do projeto inteiro.** É a única que depende de um site de terceiro estar no ar. Se o SIGMINE estiver lento ou fora, todo o resto do Escopo A muda de plano — e é melhor descobrir isso na hora 1 do que na hora 20.

---

## ESCOPO B — Formulário de caracterização

**Objetivo:** capturar, no menor número possível de campos, tudo o que a norma exige para enquadrar.
**Dificuldade:** 🟢 Baixa a 🟡 Média · **Esforço:** 3,5h
**Princípio:** o que a geometria ou o SIGMINE puderem derivar, não se pergunta. Município, área, substância, fase e sobreposições são derivados. Sobram cinco campos.

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| B.1 | Seletor de tipologia, alimentado pela Base A (Escopo C) | Toda opção da lista resolve para uma linha real da CEPRAM; zero opção órfã | 🟢 | 0,5 | P0 |
| B.2 | Campo de substância, pré-preenchido pelo SIGMINE e editável | Trocar para urânio dispara a 3ª virada da demo | 🟢 | 0,25 | P0 |
| B.3 | Regime/fase ANM, pré-preenchido pelo SIGMINE | Regime de licenciamento (Lei 6.567/1978) marcado como gatilho de competência local | 🟢 | 0,25 | P0 |
| **B.4** | ⚠️ **Controle de porte com recálculo ao vivo** — unidade variável conforme a tipologia | Arrastar reavalia o parecer em < 100 ms e move o marcador de faixa. **É a 2ª virada da demo** | 🟡 | 1,0 | P0 |
| B.5 | Campos condicionais: supressão de vegetação (sim/não + ha), recurso hídrico (captação/lançamento/barramento), explosivos (sim/não) | Só aparecem quando fazem sentido para a tipologia escolhida | 🟢 | 0,75 | P0 |
| B.6 | Estado global único, para o formulário e a tela de parecer lerem a mesma fonte | Mudança em qualquer campo propaga sem recarregar | 🟢 | 0,5 | P0 |
| B.7 | Validação e mensagens de erro que dizem o que fazer | Zero "campo inválido" genérico | 🟢 | 0,25 | P0 |
| B.8 | Revisão de vocabulário de todos os rótulos | "tipologia", "poligonal", "porte", "potencial poluente", "LP/LI/LO"; zero texto genérico | 🟢 | 0,25 | P0 |

> **Não construir:** cadastro, login, perfis, salvamento de consulta, histórico. Nada disso é pontuado em nenhum dos nove critérios.

---

## ESCOPO C — Base de regras dos 10 municípios ⚠️ CAMINHO CRÍTICO

**Objetivo:** transformar norma dispersa e habilitação municipal em dado consultável por máquina, com citação em cada linha.
**Dificuldade:** 🔴 **Alta** · **Esforço:** 12h-pessoa · **Dono:** duas pessoas, em paralelo, começando na hora 0
**Por que é o gargalo:** é trabalho documental, não código. Não acelera com mais gente além de duas, não paraleliza com IDE aberta, e tudo depois depende dele.

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| **C.1** | ⚠️ **DESTAQUE — transcrever o grupo de mineração do Anexo Único da Resolução CEPRAM 4.420/2015** | 8 a 12 tipologias em JSON: atividade, código, parâmetro de porte, faixas (micro→excepcional), potencial poluente. **Só as tipologias que os 4 cenários usam** | 🔴 | 3,0 | P0 |
| **C.2** | ⚠️ **DESTAQUE — dossiê de habilitação GAC dos 10 municípios** | Por município: habilitado (sim/não/sem evidência), nível, tipologias delegadas, URL da fonte, data de consulta, captura de tela arquivada no repo | 🔴 | 3,0 | P0 |
| C.3 | Conferir a cobertura de ramos (seção 1.1) e, se faltar ramo, acrescentar município | Os 6 ramos têm ao menos um município real cada | 🟡 | 0,5 | P0 |
| C.4 | Regras de competência em JSON, com `fundamento` obrigatório por regra | Mínimo 12 regras; nenhuma regra sem citação de dispositivo entra na base | 🟡 | 2,5 | P0 |
| C.5 | Trilhas de licença e prazos máximos de análise da Lei 15.190/2025 | Cada trilha devolve a sequência de licenças e o prazo por etapa. Parte já mapeada no Escopo 3 | 🟡 | 1,0 | P0 |
| **C.6** | ⚠️ **Conferência de cada dispositivo citado na fonte primária** | Todo `fundamento` recebe `verificado: true` ou aparece marcado como pendente na tela. **Bloqueante para afirmar qualquer coisa no pitch** | 🟡 | 2,0 | P0 |
| C.7 | Catálogo de anuências acessórias com gatilhos (ASV, outorga, órgão gestor de UC, FUNAI, IPHAN, Exército) | Cada anuência tem condição de disparo e fundamento | 🟡 | 1,5 | P1 |
| C.8 | Lista documental mínima por trilha e por instância | — | 🟡 | 2,0 | P1 |

### Contingências de C.2 — nenhuma delas para o projeto

O dado de habilitação GAC pode não estar publicado em formato utilizável. Isso foi previsto e **não é um risco de bloqueio, porque "sem evidência" é um estado válido do produto**:

| Cenário encontrado | O que o produto faz | Impacto no backlog |
| --- | --- | --- |
| GAC publicado em tabela | Carrega direto | Nenhum, C.2 cai para 1h |
| Publicado em PDF ou página não estruturada | Transcrição manual dos 10 | Nenhum, é o caso planejado |
| Não publicado para parte dos municípios | Esses viram `sem_evidencia` → **INDETERMINADO** → pedido LAI | Nenhum. Fortalece a narrativa do Escopo 3 |
| Não publicado para nenhum | Todos viram `sem_evidencia`; a demo passa a girar em torno de porte, substância e geografia | Perde a 1ª virada; as outras três seguem |

> **O que não fazer:** varrer portal de município. Já foi descartado no Escopo 3 por inviabilidade e continua descartado.

---

## ESCOPO D — Motor de match

**Objetivo:** dado o formulário mais os fatos derivados, emitir o parecer com competência, trilha, prazos, alertas e cadeia de fundamento.
**Dificuldade:** 🟡 Média · **Esforço:** 8h · **Dono:** 1 pessoa, TypeScript puro, sem dependência
**Por que é confortável:** é a parte mais testável do projeto. Roda contra fixtures desde a hora 2 e não espera o dado real.

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| D.1 | Construtor de `FactBase`: fatos declarados + derivados + de cadastro | Nenhuma regra lê o formulário direto; tudo passa pelo FactBase | 🟡 | 1,0 | P0 |
| D.2 | Avaliador de predicados: `igual`, `em`, `contem`, `maior`, `menor`, `entre`, `existe` | 100% dos predicados usados pelas 12 regras cobertos por teste unitário | 🟡 | 1,5 | P0 |
| D.3 | Resolução por precedência (federal 100 → estadual 60 → municipal 30 → fallback 0) e registro dos fatores concorrentes | A regra de maior precedência decide; as demais aparecem no parecer como fatores concorrentes | 🟡 | 1,0 | P0 |
| **D.4** | ⚠️ **DESTAQUE — detecção do limiar de virada** | Varre o parâmetro de porte sobre as fronteiras de faixa da tipologia, reavalia em cada uma e devolve o ponto exato em que a competência muda. Alimenta o estado CONDICIONAL e os marcadores do controle deslizante | 🔴 | 2,0 | P0 |
| D.5 | Lógica dos três estados: DEFINIDA / CONDICIONAL / INDETERMINADO | Nenhum caminho retorna competência sem fato suficiente. Falta de fato → INDETERMINADO, nunca chute | 🟡 | 1,0 | P0 |
| D.6 | Rastro de execução: lista ordenada das regras disparadas, com fundamento, para o painel "por quê?" | Cada conclusão da tela abre a cadeia completa que a produziu | 🟢 | 0,75 | P0 |
| D.7 | Serializador do `Parecer` em JSON canônico | Consumido pela interface, pelo comparador (E) e pelo gerador LAI (G) sem adaptação | 🟢 | 0,5 | P0 |
| **D.8** | ⚠️ **Suíte de testes com as 4 viradas como fixtures** | Os 4 cenários rodam verdes no CI antes do congelamento. É o que garante que a demo não quebra no palco | 🟡 | 1,0 | P0 |

> **Sobre D.4:** a implementação ingênua seria busca binária sobre um espaço contínuo. Desnecessário — as faixas de porte da CEPRAM são função degrau, com 4 ou 5 fronteiras por tipologia. Basta reavaliar o motor em cada fronteira e registrar onde a saída muda. Exato, barato, e produz de brinde os marcadores visuais do controle deslizante.

---

## ESCOPO E — Análise comparativa e gráficos

**Objetivo:** quando existe mais de um caminho legalmente viável, o produto não devolve uma lista — devolve uma **comparação decidível**, com número e fundamento em cada opção.
**Dificuldade:** 🟡 Média · **Esforço:** 5,5h
**Valor de banca:** é o escopo que mais rende por hora. Toca *design e experiência do usuário*, *grau de completude* e *potencial de impacto* ao mesmo tempo, e é o que separa "consulta" de "apoio à decisão".

### O que é comparado

| Eixo de comparação | Quando aparece | Dimensões |
| --- | --- | --- |
| **Trilha de licenciamento** — trifásico (LP→LI→LO) vs. LU vs. LAC vs. LAE | Sempre que mais de uma modalidade é elegível | Prazo legal acumulado · nº de estudos · nº de anuências · natureza do risco |
| **Instância** — Município vs. INEMA | Estado CONDICIONAL, ou poligonal cruzando divisa | Prazo legal · exigência documental · evidência de capacidade do órgão |
| **Cenário de porte** | Sempre que o valor declarado está perto de uma fronteira de faixa | O limiar exato e o que muda de cada lado |

### Gráficos — e por que cada um

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| **E.1** | ⚠️ **Barras horizontais: prazo legal máximo acumulado por trilha, em meses** | Este é o gráfico que traduz lei em número. Barra, não pizza. Unidade sempre visível. Cada barra clicável abre o fundamento | 🟡 | 1,5 | P0 |
| E.2 | Linha do tempo horizontal da trilha selecionada: LP → LI → LO com prazo por etapa | Mostra concretamente por que o setor fala em "3 a 8 anos" | 🟡 | 1,0 | P0 |
| E.3 | Marcador de faixas de porte com posição atual e ponto de virada | Alimentado por D.4. Mostra ao usuário a que distância está do limiar | 🟡 | 1,0 | P0 |
| E.4 | Matriz de comparação lado a lado das opções viáveis | Tabela densa: opção × [prazo, estudos, anuências, elegibilidade, fundamento]. Números tabulares | 🟡 | 1,0 | P1 |
| E.5 | Barras empilhadas de exigências por opção (estudos + anuências + autorizações) | Comparação de volume documental entre caminhos | 🟢 | 0,75 | P1 |
| E.6 | Painel de alertas geoespaciais com severidade | Cor **mais** ícone **mais** texto — nunca informação codificada só por cor | 🟢 | 0,75 | P1 |

### Duas travas de honestidade — não negociáveis

**1. Só se plota prazo legal, nunca prazo observado inventado.** O prazo legal vem da Lei 15.190/2025 e é verificável. O prazo real observado é outra coisa: a média de 1.563 dias de análise que circula no setor refere-se a processos da **ANM**, não a licenciamento no INEMA. Misturar as duas coisas num mesmo gráfico é o tipo de erro que um jurado do setor identifica na hora e desconta em viabilidade. Se o time quiser citar a realidade observada, cita **na fala, com a fonte e o escopo corretos** — não como série de dados na tela.

**2. O produto exibe o limiar; não recomenda ficar abaixo dele.** Mostrar "acima de X t/ano a competência passa ao Estado" é informação. Sugerir declarar menos, ou fracionar a área para permanecer numa faixa menor, é orientar fracionamento irregular — e isso destrói a credibilidade do time diante de qualquer jurado que conheça o setor. O texto da interface tem de deixar claro que o limiar é uma fronteira normativa, não uma otimização. Uma linha na tela resolve, e vale ponto em maturidade de produto.

---

## ESCOPO F — Shell da aplicação e interface

**Objetivo:** duas telas que pareçam produto, não protótipo. Design é critério pontuado nas **duas** bancas.
**Dificuldade:** 🟡 Média · **Esforço:** 8h · **Dono:** front-end, em paralelo desde a hora 2 contra fixtures

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| F.1 | Tela de consulta: mapa à esquerda, busca e formulário à direita | Três modos de entrada de área acessíveis sem menu | 🟡 | 2,5 | P0 |
| **F.2** | ⚠️ **DESTAQUE — tela de parecer** | Cabeçalho com instância competente, nº de licenças, prazo legal somado e contagem de alertas; trilha em linha do tempo; painel de fundamento. É a tela mais complexa e a que vira o slide 4 do deck | 🔴 | 3,0 | P0 |
| F.3 | Painel "por quê?" expansível, com a cadeia de regras e citações | Fundamento não conferido aparece visualmente marcado como pendente | 🟡 | 1,0 | P0 |
| F.4 | Estado INDETERMINADO com chamada para o gerador de pedido LAI | Transição para o Escopo 3 sem sair da tela | 🟢 | 0,75 | P0 |
| F.5 | Estados vazio e de carregamento; nome de produto e marca mínima | Zero tela branca durante a demo. Produto com nome parece empresa | 🟢 | 0,75 | P0 |
| F.6 | Mapa: camadas GeoJSON sobre fundo neutro, sem tiles | Carrega instantâneo, zero rede. Se sobrar tempo, PMTiles com recorte da Bahia | 🟡 | 1,0 | P0 |
| F.7 | Exportação do parecer em PDF | — | 🟡 | 1,5 | P1 |
| F.8 | Vista mobile pensada para uso em campo | — | 🟡 | 2,0 | P2 |

**Decisões visuais travadas:** uma fonte, quatro tamanhos, dois pesos · uma cor de destaque e cinzas · espaçamento em múltiplos de 8 · números tabulares em toda tabela e KPI · verde/âmbar/vermelho só com significado operacional · nenhum gráfico de pizza, nenhum 3D · timestamp e procedência visíveis em todo dado exibido.

---

## ESCOPO G — Integração com o Escopo 3

**Objetivo:** o estado INDETERMINADO do motor alimenta, sem intervenção manual, o gerador de pedido de acesso à informação já construído.
**Dificuldade:** 🟢 Baixa · **Esforço:** 1,5h

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| G.1 | Mapear o `Parecer` INDETERMINADO para os campos do gerador LAI | Município, tipologia, fato faltante e artigos aplicáveis chegam preenchidos | 🟢 | 0,75 | P0 |
| G.2 | Botão de ação na tela de parecer e transição visual | Um clique, sem recarregar, sem digitar de novo | 🟢 | 0,5 | P0 |
| G.3 | Registrar no parecer exportado que o pedido foi gerado | Rastreabilidade da ação | 🟢 | 0,25 | P1 |

---

## ESCOPO H — Entregáveis do regulamento

**Dificuldade:** 🟢 Baixa · **Esforço:** 5h · **Dono:** apresentador, fora do caminho crítico de código

| ID | Task | Critério de aceite | Dif. | h | Pri. |
| --- | --- | --- | --- | --- | --- |
| H.1 | README: arquitetura, fontes com data de coleta, premissas, limitações declaradas | Um jurado consegue reproduzir a base de dados a partir dele | 🟢 | 1,0 | P0 |
| H.2 | `LICENSE` aberta com restrição de uso comercial (item 10.4 do regulamento) | No repositório | 🟢 | 0,25 | P0 |
| **H.3** | ⚠️ **Vídeo de demonstração de 60 a 90 s, gravado ainda na noite de 01/08** | Existe, mesmo feio. Regrava-se de manhã se der. Um vídeo mediano que existe vale mais que um ótimo que não deu tempo | 🟢 | 1,0 | P0 |
| H.4 | Deck de 8 slides exportado em PDF e conferido | O slide 4 é um screenshot grande da tela de parecer | 🟢 | 1,5 | P0 |
| H.5 | Três ensaios cronometrados com a demo rodando | Cabe em 3 minutos com a demo incluída | 🟢 | 1,0 | P0 |
| H.6 | Envio completo até 13h30 | Com uma hora de folga sobre o prazo | 🟢 | 0,25 | P0 |

---

## 4. Alocação e janelas

Soma de P0: **≈ 44 horas-pessoa.** Com quatro pessoas construindo e uma no pitch, cabe nas horas disponíveis — sem folga.

| Faixa | Dados e Jurídico (2p) | Motor (1p) | Front (1p) | Pitch (1p) |
| --- | --- | --- | --- | --- |
| **Bloco 1** — primeiras 3h | **A.1 imediatamente**, depois C.1 e C.2 em paralelo | 0.2, 0.3, D.1, D.2 | 0.1, F.1 contra fixtures | Roteiro de 3 min em uma página |
| **Bloco 2** — até o meio da noite | C.3, C.4, A.2–A.5 | D.3, D.4, D.5 | F.2, F.6 | Esqueleto do deck, Q&A |
| **Bloco 3** — até T-3h do congelamento | C.5, C.6, A.7, A.8 | D.6, D.7, **D.8** | F.3, F.4, E.1, E.2 | **H.3 — grava o vídeo** |
| **02h30 — CONGELAMENTO** | Nada novo entra. Só correção e polimento. | | | |
| **Manhã de 02/08** | Verificação final de fundamentos | Testes verdes | F.5, E.3, polimento | H.4, H.5 |
| **13h30** | **H.6 — envio completo** | | | |

---

## 5. As seis tasks que decidem o projeto

Em ordem de risco. Se alguma destas estiver atrasada num checkpoint, corta-se de outro lugar — nunca destas.

| # | Task | Por quê | Sinal de alarme |
| --- | --- | --- | --- |
| 1 | **A.1** — baixar o SIGMINE | Única dependência de terceiro no ar. Tudo do Escopo A e metade do realismo da demo saem daqui | Não estar no repo na hora 1 |
| 2 | **C.2** — dossiê de habilitação dos 10 municípios | Define quais viradas da demo existem | Menos de 5 municípios levantados na metade do Bloco 2 |
| 3 | **C.1** — transcrição da CEPRAM | Sem função de porte não há 2ª virada, e a 2ª virada é o momento "wow" | Menos de 6 tipologias ao fim do Bloco 2 |
| 4 | **D.4** — detecção do limiar | É o que prova que existe motor e não tabela de respostas | Não fechar antes do Bloco 3 |
| 5 | **F.2** — tela de parecer | É a tela que a banca olha e o slide 4 do deck | Não estar navegável no início do Bloco 3 |
| 6 | **H.3** — vídeo de backup | É a apólice de seguro da entrega inteira | Não existir ao fim do Bloco 3 |

---

## 6. Ordem de corte pré-aprovada

Corta-se de baixo para cima, sem reunião e sem discussão:

`F.8 → A.10 → C.8 → F.7 → E.5 → E.6 → C.7 → E.4 → A.9`

Se depois disso ainda faltar tempo, o corte seguinte é reduzir C.1 a **6 tipologias** — exatamente as que as quatro viradas da demo usam — e declarar a cobertura na interface e no README.

---

## 7. Definition of Done — vale para toda task

- Roda com a rede desligada.
- Tem dado de exemplo plausível: nomes reais do contexto baiano, zero "teste123" e zero "Lorem ipsum".
- Toda afirmação normativa na tela carrega fundamento, ou marcação visível de pendência de conferência.
- Números têm unidade, são tabulares e vêm com referência de comparação.
- Commitado com mensagem descritiva e autoria distribuída ao longo das 48h.
- Não quebra os 4 testes de virada da demo (D.8).
