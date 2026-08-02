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
errado — descoberta tarde demais. Na raiz disso está um problema mais
básico: dado que deveria ser público (quem licenciou o quê, onde, sob qual
regra) está espalhado, não estruturado e, na prática, polarizado — quem tem
acesso a ele tem vantagem sobre quem não tem.

**A pergunta que o produto responde:** dada uma poligonal minerária na Bahia,
quem licencia (União/Estado/Município), por qual trilha, em que prazo legal,
com base em qual dispositivo — **ou** declara `INDETERMINADO` de forma
honesta e gera automaticamente o pedido de acesso à informação (LAI) que
preenche a lacuna, em vez de adivinhar.

---

## 2. Âmbito de implementação

O projeto **não faz mais recorte de municípios** — considera os 417
municípios da Bahia. A mudança de abordagem que viabiliza isso: em vez de
depender só de curadoria manual de regra por município (inviável em escala),
o enquadramento passa a se apoiar numa **base de dados estruturada e pronta
para análise estatística**.

O motor de match combina dois sinais:

1. **Match reforçador (estatístico/histórico)** — pega o histórico de
   licenciamento dos últimos 2 anos e cruza com o caso do usuário
   (substância, tipologia, porte). Devolve uma lista dos municípios mais
   prováveis de licenciar aquele caso: são municípios que já tiveram casos
   parecidos, logo evidenciam que atendem aos critérios legais e
   provavelmente ainda têm profissional capacitado em quadro. Presença de
   histórico similar é evidência forte de capacidade vigente, não garantia.
2. **Match normativo** — regras de cada município (CEPRAM + habilitação
   GAC), como antes, só que aplicadas ao universo completo, não a uma
   amostra de 10.

Essa combinação é a resposta direta ao problema central identificado: falta
de transparência de dado que deveria ser público e a polarização de
informação que isso gera. Em vez de recorte pequeno e auditado à mão, o
produto expõe abertamente onde o dado é forte (histórico com casos
similares) e onde é fraco (`INDETERMINADO`), em vez de esconder a lacuna
atrás de um escopo reduzido.

### Peças que compõem o sistema (Escopos A–H, ver `documentation/BACKLOG.md`)

| Escopo | O que é |
| --- | --- |
| **A** | Busca de processo minerário ANM/SIGMINE → poligonal real no mapa |
| **B** | Formulário de caracterização (tipologia, substância, porte, etc.) |
| **C** | Base de regras por município — CEPRAM + habilitação GAC, para os 417 municípios (caminho crítico, trabalho documental + dado histórico) |
| **D** | Motor de match: `FactBase` → `Parecer` (competência, trilha, prazo, fundamento), combinando match normativo com match estatístico/histórico |
| **E** | Análise comparativa: gráficos de prazo por trilha, marcador de faixa de porte |
| **F** | Interface: tela de busca/formulário + tela de parecer |
| **G** | Integração com gerador de pedido LAI quando `INDETERMINADO` |
| **H** | Entregáveis do regulamento (README, licença, vídeo, deck) |

O **pipeline de pesquisa profunda** em `research_pipeline/` (LangGraph +
Gemini Deep Research + DeepSeek) é a peça que produz essa base histórica:
levanta **quais municípios baianos de fato concederam licenças de
mineração**, via consórcio ou gestão própria, nos últimos 2 anos — insumo
direto do match reforçador da Base C/D, não mais um anexo desconectado da
demo.

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
- **Combate à polarização de informação**: dado de licenciamento municipal
  que hoje só quem já opera na região conhece vira base estruturada e
  consultável por qualquer empreendedor, via match estatístico sobre
  histórico público.

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
research_pipeline/GOAL.md  pipeline de coleta do histórico de licenças municipais (LangGraph) — alimenta o match reforçador
documentation/BACKLOG.md   plano completo, com critérios de aceite por task
```

Licença: **CC BY-NC 4.0** — uso comercial vedado.
