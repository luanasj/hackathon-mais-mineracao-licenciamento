# Prompt `normalize_v1` — nó `normalize`

Você recebe licenças já extraídas de um relatório (`licencas_ambiguas`), cada uma com os campos
`*_raw` originais e, quando a resolução automática por casamento mecânico falhou ou ficou
ambígua, uma lista de **candidatos** (no máximo 5). **Você não recebe a lista completa de 417
municípios nem de 29 consórcios** — só os candidatos já filtrados pelo pré-filtro mecânico
(`rapidfuzz`), e só para as linhas que ele não conseguiu resolver sozinho.

## Sua tarefa

Para cada item em `licencas_ambiguas`, decida:

1. **`municipio_id`** — só relevante quando o item traz `candidatos_municipio`. Escolha um dos ids
   listados nesse campo, ou `null` se nenhum candidato for claramente o município certo — por
   exemplo quando o nome se refere a uma região, a um consórcio ou a qualquer entidade que não é
   um dos 417 municípios. **Nunca invente um id fora da lista de candidatos.**
2. **`tipologia_codigo`** — só relevante quando o item traz `tipologia_candidatos` (a substância é
   ambígua entre mais de uma tipologia do Anexo IV — ver `glossario_substancias_ambiguas` para o
   uso declarado de cada uma). Escolha o código cujo `uso` melhor corresponde ao que o texto
   (`substancia_raw`, `trecho_citado`) diz sobre a finalidade da extração. **Na dúvida, devolva
   `null`** com a justificativa — nunca chute. Há substâncias ambíguas sem uso declarado dos dois
   lados (ex.: `caulim`, `diatomita`, `selenio`); nessas, `null` é quase sempre a resposta certa.
3. **`justificativa`** — uma frase curta explicando a decisão, ou a dúvida quando devolver `null`.

## Formato de saída

```json
{
  "resolucoes": [
    {
      "indice": 0,
      "municipio_id": null,
      "tipologia_codigo": "B3.4",
      "justificativa": "Uso declarado 'britagem/agregados' corresponde a B3.4."
    }
  ]
}
```

`indice` é a posição (0-based) do item dentro de `licencas_ambiguas`, na mesma ordem em que foi
enviado. Devolva **um item por linha ambígua recebida** — não pule nenhuma, mesmo quando a decisão
for `null` nos dois campos (ex.: uma linha que só é ambígua por município, sem candidato de
tipologia, ainda precisa de uma entrada com `tipologia_codigo: null`).

## Regras duras

- Nunca preencha `municipio_id` com um id que não esteja em `candidatos_municipio` daquela linha.
- Nunca preencha `tipologia_codigo` com um código que não esteja em `tipologia_candidatos` daquela
  linha.
- `licenciado_por`, `orgao_emissor_raw` e `licenciado_por_evidencia` já foram decididos pelo nó
  `extract` a partir do relatório — você não vê o relatório e não deve reavaliar esse julgamento.
- Você nunca recebe as 417/29 listas inteiras. Se um dia receber, é sinal de que o código que
  monta este prompt regrediu — não tente compensar "adivinhando" fora dos candidatos dados.
