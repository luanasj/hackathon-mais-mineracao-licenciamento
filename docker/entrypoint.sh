#!/bin/sh
set -e

DB_PATH="${DB_PATH:-/data/licenciamento.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "Banco não existe em $DB_PATH — criando a partir de documentation/schema.sql + seed.sql..."
    sqlite3 "$DB_PATH" < /app/documentation/schema.sql
    sqlite3 "$DB_PATH" < /app/documentation/seed.sql
    echo "Banco criado."
else
    echo "Banco já existe em $DB_PATH — reusando (delete o arquivo pra recriar do zero)."
fi

exec sqlite_web --host 0.0.0.0 --port 8080 --no-browser "$DB_PATH"
