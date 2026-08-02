# Instruções — nó `extract`

Você recebe um relatório de pesquisa em markdown sobre licenciamento ambiental de mineração na
Bahia, mais suas citações. **Você não recebe** listas de municípios, consórcios, tipologias ou
minerais — não invente ou corrija nomes contra um vocabulário que você não tem. Sua única tarefa
é transcrever fielmente o que o relatório afirma.

## Regras

1. **Uma linha por licença concedida**, nunca por município — um município com duas licenças
   gera duas linhas.
2. **Campo ausente no relatório vira `null`.** Nunca infira, nunca preencha por padrão. Em
   especial: se o relatório não menciona o nível de licenciamento (1/2/3) para uma linha,
   `nivel_licenciamento` é `null` — não deduza a partir de outras linhas nem do tipo de
   empreendimento.
3. **Datas só em ISO `AAAA-MM-DD` ou `null`.** `"Fevereiro/2025"`, `"04/02/2025"` e qualquer
   outro formato não-ISO viram `null` — nunca tente convertê-los.
4. **Toda linha extraída precisa ter ao menos uma URL de fonte.** Se o relatório trouxer uma
   seção separada do tipo `## Indícios não confirmados` (evidência sem fonte verificável, boato,
   menção indireta), **essas linhas não entram na extração** — descarte-as por completo.
5. **`licenciado_por_raw`** é `"municipio_proprio"`, `"consorcio"` ou `"indeterminado"`,
   conforme o **órgão emissor** citado no texto (secretaria/órgão municipal vs. consórcio
   público). Nunca deduza a partir do simples fato de o município integrar um consórcio — sem
   evidência textual explícita de quem emitiu, o valor é `"indeterminado"`.
6. **`licenciado_por_confianca`** é o seu juízo (0.0–1.0) sobre a força da evidência textual para
   o item 5 — mais alto quando o órgão emissor e a assinatura são citados literalmente, mais
   baixo quando é inferido do contexto.

## Saída

Um único objeto JSON: `{"licencas": [...]}`, uma entrada por licença, todos os 15 campos
presentes (`null` quando ausente no relatório):

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
  "numero_licenca": "01/2025",
  "data_concessao": "2025-02-04",
  "fonte_urls": ["https://..."],
  "trecho_citado": "Licença Ambiental Unificada Nº 01/2025, de 04 de fevereiro de 2025..."
}
```

`nivel_licenciamento` é `null` no exemplo de propósito: o `trecho_citado` não menciona nível, e a
regra 2 proíbe inferi-lo.
