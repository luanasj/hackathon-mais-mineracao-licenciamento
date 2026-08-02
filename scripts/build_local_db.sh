#!/bin/sh
# Cria data/db/licenciamento.db no host, a partir dos mesmos três SQL que
# docker/entrypoint.sh aplica dentro do contêiner.
#
# Existe porque o compose usa volume nomeado (não bind-mount, ver comentário em
# docker-compose.yml), então o .db nunca aparece na árvore do repo — e
# backend/src/db.ts:28 aponta justamente para data/db/licenciamento.db. Sem
# isto, o backend não sobe sem um `docker cp` manual.
#
# Idempotente por recriação: apaga e refaz. O banco é derivado 100% de
# schema.sql + seed.sql + seed_regras.sql, não guarda estado próprio.
set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="${DB_PATH:-$RAIZ/data/db/licenciamento.db}"

mkdir -p "$(dirname "$DB_PATH")"
rm -f "$DB_PATH"

sqlite3 "$DB_PATH" < "$RAIZ/documentation/schema.sql"
sqlite3 "$DB_PATH" < "$RAIZ/documentation/seed.sql"
sqlite3 "$DB_PATH" < "$RAIZ/documentation/seed_regras.sql"
# Depois do seed: o `rebuild` do FTS5 indexa as linhas já inseridas.
sqlite3 "$DB_PATH" < "$RAIZ/documentation/schema_fts.sql"

echo "Banco criado em $DB_PATH"
sqlite3 "$DB_PATH" "
  SELECT 'municipio            ', COUNT(*) FROM municipio
  UNION ALL SELECT 'consorcio            ', COUNT(*) FROM consorcio
  UNION ALL SELECT 'habilitacao_gac      ', COUNT(*) FROM habilitacao_gac
  UNION ALL SELECT 'tipologia            ', COUNT(*) FROM tipologia
  UNION ALL SELECT 'tipologia_nivel_gestao', COUNT(*) FROM tipologia_nivel_gestao
  UNION ALL SELECT 'classe_impacto       ', COUNT(*) FROM classe_impacto
  UNION ALL SELECT 'ato_diario_oficial   ', COUNT(*) FROM ato_diario_oficial
  UNION ALL SELECT 'pesquisa_run         ', COUNT(*) FROM pesquisa_run
  UNION ALL SELECT 'licenca              ', COUNT(*) FROM licenca
  UNION ALL SELECT 'regra                ', COUNT(*) FROM regra
  UNION ALL SELECT 'ato_fts (índice)     ', COUNT(*) FROM ato_fts;
"
