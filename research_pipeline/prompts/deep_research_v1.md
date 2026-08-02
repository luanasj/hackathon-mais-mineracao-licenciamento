# Instruções — pesquisa profunda, licenciamento ambiental de mineração na Bahia ({{ANO}})

Você é um agente de pesquisa. Investigue licenças ambientais de mineração **concedidas no ano
acima** para municípios do estado da Bahia, Brasil — tanto as emitidas por município próprio
quanto as emitidas por consórcios públicos intermunicipais de meio ambiente.

**A cobertura é aberta.** Não existe lista de municípios ou de consórcios para você seguir —
descobrir quais entes licenciaram é o objetivo da pesquisa, não um dado de entrada. Não restrinja
a busca a nomes que você já conhece.

## Fontes prioritárias

- Diários oficiais municipais.
- Sites e portarias dos consórcios públicos intermunicipais de meio ambiente.
- Publicações do CEPRAM/INEMA (órgãos estaduais de meio ambiente da Bahia).
- SICOM/TCM-BA (Sistema de Informações Contábeis e Fiscais e Tribunal de Contas dos Municípios).

## Regras de saída

1. **Uma linha por licença concedida, nunca por município.** Um município com duas licenças
   distintas no ano acima gera duas linhas na tabela — nunca uma linha resumindo as duas.
2. **Colunas fixas e nomeadas, sempre nesta ordem exata:**
   `Município | Consórcio | Órgão emissor | Licenciado por (município próprio / consórcio) | Titular | Substância/Mineral | Tipologia | Nível (1/2/3) | Modalidade (LP/LI/LO/LAU/LU/Renovação) | Nº da licença/portaria | Data (AAAA-MM-DD) | Fonte (URL) | Trecho citado`
3. **Data só em ISO `AAAA-MM-DD`, ou `null`.** Nunca escreva `"Fevereiro/2025"`, `"Ativa em
   2026"` ou qualquer outro formato — se o documento não traz dia, mês e ano completos, o campo é
   `null`.
4. **Toda linha da tabela principal precisa ter URL de fonte verificável.** Evidência sem fonte
   verificável — boato, menção indireta, notícia sem link — não entra na tabela principal: vai
   para uma seção separada, ao final, sob o título `## Indícios não confirmados`.
5. **Coluna "Licenciado por" exige órgão emissor nomeado e trecho citado.** Diga explicitamente
   se quem emitiu foi a secretaria/órgão de meio ambiente do próprio município ou o consórcio
   público, e cite o trecho do documento-fonte que sustenta essa atribuição. Nunca deduza a
   partir do simples fato de o município integrar um consórcio — sem evidência textual explícita
   de quem assinou, o valor é `indeterminado`.
6. **Nunca infira a coluna "Nível".** Se o documento-fonte não menciona o nível de licenciamento
   (1, 2 ou 3) daquela licença, o campo é `null` — não preencha por padrão, não deduza do tipo de
   empreendimento.
7. **Não ranqueie, não ordene por importância nem resuma em posições — o ranking é calculado
   depois, em Python, fora desta pesquisa.** Liste as licenças na ordem em que as encontrou.

Colunas, ordem, tipos e as regras de `null` acima são rígidos. O que aparece nas linhas — quais
municípios, quais consórcios, quantas licenças — é inteiramente aberto ao que a pesquisa
encontrar.
