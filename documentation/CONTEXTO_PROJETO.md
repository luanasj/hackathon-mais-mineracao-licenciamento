# Contexto do Projeto — Motor de Enquadramento Licenciatório

**Hackathon+ Mineração 2026 · Escopo A — Licenciamento**

> Documento de ambientação. Objetivo: qualquer agente (humano ou IA) que entrar
> no projeto sem contexto prévio consegue, lendo isto, entender o quê, o porquê
> e onde cada peça mora no repo.

---

## 1. O problema

Mineração no Brasil tem competência de licenciamento ambiental fragmentada
entre três entes — União, Estado e Município — de acordo com regras que
cruzam múltiplas normas (Lei 6.567/1978, LC 140/2011, Resolução CEPRAM
4.420/2015, Lei 15.190/2025, habilitação municipal via GAC). Na prática,
descobrir **quem licencia um empreendimento minerário específico** exige
cruzar manualmente: substância minerada, porte declarado, se o município tem
habilitação ambiental para aquela tipologia, se há gatilho federal (ex.
urânio), e se a área se sobrepõe a mais de um município.

Ninguém faz esse cruzamento de forma sistemática. O resultado é
insegurança jurídica, atraso de processos e, no pior caso, escolha do rito
errado — descoberta tarde demais.

**A pergunta que o produto responde:** dada uma poligonal minerária na Bahia,
quem licencia (União/Estado/Município), por qual trilha, em que prazo legal,
com base em qual dispositivo — **ou** declara `INDETERMINADO` de forma
honesta e gera automaticamente o pedido de acesso à informação (LAI) que
preenche a lacuna, em vez de adivinhar.

---

## 2. Âmbito de implementação (MVP)

Decisão central do projeto: **recorte de 10 municípios da Bahia**, em vez dos
417. Isso não é uma concessão de escopo — é uma mudança de natureza do
problema: em vez de curadoria de dado inviável em 48h, vira base de
conhecimento pequena e auditada à mão, com fonte e data de consulta em cada
linha.

Os 10 municípios (escolhidos para cobrir todos os ramos de decisão do motor,
não por relevância mineral): **Jacobina, Jaguarari, Maracás, Campo Formoso,
Pojuca, Caetité, Brumado, Itagibá, Andorinha, Santaluz**.

Fora dessa amostra, o sistema devolve `INDETERMINADO` por design — a
limitação é funcionalidade, não bug.

### Peças que compõem o sistema (Escopos A–H, ver `documentation/BACKLOG.md`)

| Escopo | O que é |
| --- | --- |
| **A** | Busca de processo minerário ANM/SIGMINE → poligonal real no mapa |
| **B** | Formulário de caracterização (tipologia, substância, porte, etc.) |
| **C** | Base de regras dos 10 municípios — CEPRAM + habilitação GAC (caminho crítico, trabalho documental) |
| **D** | Motor de match: `FactBase` → `Parecer` (competência, trilha, prazo, fundamento) |
| **E** | Análise comparativa: gráficos de prazo por trilha, marcador de faixa de porte |
| **F** | Interface: tela de busca/formulário + tela de parecer |
| **G** | Integração com gerador de pedido LAI quando `INDETERMINADO` |
| **H** | Entregáveis do regulamento (README, licença, vídeo, deck) |

Além do motor síncrono (D), há um **pipeline de pesquisa profunda** em
`research_pipeline/` (LangGraph + Gemini Deep Research + DeepSeek), separado
e fora do escopo do motor: produz uma base de dados sobre **quais municípios
baianos de fato concederam licenças de mineração**, via consórcio ou gestão
própria — insumo para preencher a Base C no futuro, não usado na demo do
MVP.

Tudo roda **offline** — sem chamada externa em tempo de execução, dados
geoespaciais pré-processados no repositório (`pipeline/prep.py`).

---

## 3. Objetivo

Demonstrar, em uma única tela de formulário, que mudar **um campo por vez**
faz a resposta de competência saltar entre os quatro desfechos possíveis —
prova viva de que existe um motor de regras real, não uma tabela de respostas
decoradas:

| # | Muda um campo | Resposta salta para | Prova |
| --- | --- | --- | --- |
| 1 | Sondagem, pequeno porte, município habilitado | **MUNICIPAL — definida** | Caminho feliz com fundamento citado |
| 2 | Porte sobe de 40.000 para 150.000 t/ano | **ESTADUAL — INEMA** | Função de porte real, limiar exibido |
| 3 | Substância vira urânio (Caetité) | **UNIÃO — IBAMA** | Precedência federal absorve tudo abaixo |
| 4 | Poligonal cruza divisa municipal | **INDETERMINADO** → gera pedido LAI | Sistema não chuta; limitação vira ação |

Isso cabe em 60 segundos de demo e é o argumento central do produto.

---

## 4. Impacto

- **Segurança jurídica**: reduz o risco de empreendedor ou órgão escolher o
  rito errado de licenciamento por desconhecer sobreposição de competências.
- **Honestidade como funcionalidade**: quando falta dado, o sistema não
  inventa resposta — declara `INDETERMINADO` e já produz o pedido de acesso
  à informação (LAI) que resolveria a lacuna. Isso é vendido como virtude,
  não como falha.
- **Prazo real vs. prazo legal**: o produto só exibe prazo **legal** (da Lei
  15.190/2025), nunca médias observadas de mercado — evita confundir tempo de
  análise de ANM (outorga mineral) com tempo de licenciamento ambiental, erro
  comum no setor.
- **Não orienta fracionamento irregular**: mostra o limiar de porte que muda
  a competência, mas nunca sugere ficar abaixo dele — linha ética travada
  desde o design.
- **Reprodutibilidade**: toda fonte de dado é versionada em bruto no repo,
  com data de coleta — a base pode ser reconstruída sem depender de nenhum
  site de terceiro continuar no ar.

---

## 5. Onde olhar primeiro no código

```
data_source/            brutos versionados (SIGMINE, malha IBGE, leis, CEPRAM)
pipeline/prep.py         gera os GeoJSON consumidos pelo front
frontend/src/lib/
  schemas.ts             contrato de dado congelado (Tipologia, MunicipioHabilitacao, Regra, Parecer)
  motor.ts               motor de match (Escopo D)
  fatos.ts               formulário → FactBase
frontend/src/parecer/    tela de veredito, mapa, painel de fundamento (Escopo F)
research_pipeline/GOAL.md  pipeline separado de coleta de licenças municipais (LangGraph)
documentation/BACKLOG.md   plano completo, com critérios de aceite por task
```

Licença: **CC BY-NC 4.0** — uso comercial vedado.
