# Pipeline de dados

Ordem de execução — cada script consome a saída do anterior:

```
1. python scripts/collect_gac.py snapshot          # arquiva evidência das páginas-fonte
   python scripts/collect_gac.py add ...            # registra cada checagem manual de habilitação
                                                      # -> data/processed/municipios_habilitados.json

2. python scripts/collect_querido_diario.py         # leis/atos, só para quem está "habilitado"
                                                      # -> data/raw/querido_diario/*.json

3. python scripts/collect_contatos.py               # gera stubs -> preencher à mão
                                                      # -> data/raw/contatos/*.json

4. python scripts/build_dataset.py                  # consolida tudo
                                                      # -> data/processed/{gac_habilitacao,leis_por_municipio,contatos_por_municipio}.json
```

**Regra de ouro:** tudo isso roda antes da demo. A aplicação nunca chama API
externa nem faz scraping ao vivo no palco — ela só lê os JSONs em
`data/processed/`. Cada registro carrega `fonte`/`fonte_url` e
`data_consulta`/`data_de_coleta`; sem isso o registro é descartado com aviso
por `build_dataset.py`.

## Escopo de municípios

Não é um recorte fixo de 10 nem os 417 da Bahia inteira: é **todo município
que a checagem manual do GAC confirmar como habilitado**. O que não for
confirmado (nem sim, nem não) vira `sem_evidencia` — estado de produto válido,
que o motor traduz em `INDETERMINADO`, não um bloqueio de pipeline.

## Estrutura

```
data/
  raw/
    gac/{data}_{fonte}.html          # snapshots de evidência (collect_gac.py snapshot)
    querido_diario/{codigo_ibge}_{termo}.json
    contatos/{codigo_ibge}.json      # stub -> preenchido à mão
  processed/
    municipios_habilitados.json      # lista mestra, produzida por collect_gac.py add
    gac_habilitacao.json
    leis_por_municipio.json
    contatos_por_municipio.json
```
