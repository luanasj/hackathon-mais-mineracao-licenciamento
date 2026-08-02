# Imagem da aplicação — contêiner único para o Cloud Run.
#
# O Express serve as duas coisas na mesma origem: `/api/*` pelas rotas de
# `backend/src/server.ts` e o bundle do Vite por `express.static`. É isso que
# dispensa CORS e uma `VITE_API_URL` no build — `frontend/src/lib/api.ts`
# chama `/api/...` com caminho relativo.
#
# O banco entra assado (stage `db`): `licenciamento.db` é derivado 100% dos
# quatro .sql de documentation/ e aberto com `readOnly: true` em
# `backend/src/db.ts`. Nada de Cloud SQL, volume ou disco persistente.
#
# O browser sqlite-web do `docker compose` é outro arquivo:
# docker/Dockerfile.sqliteweb.

# ---------------------------------------------------------------------------
# Stage 1 — bundle do frontend
# ---------------------------------------------------------------------------
FROM node:24-slim AS frontend

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# `npx vite build` e não `npm run build`: o script do package.json é
# `tsc -b && vite build`, e o typecheck não é requisito de publicação — uma
# regressão de tipo não deve poder derrubar um deploy. O portão do `tsc` fica
# no CI e no `npm run build` local, onde o erro é barato. Se preferir o
# contrário, troque por `npm run build`.
RUN npx vite build

# ---------------------------------------------------------------------------
# Stage 2 — banco, na mesma ordem de scripts/build_local_db.sh
# ---------------------------------------------------------------------------
FROM debian:stable-slim AS db

RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY documentation/schema.sql documentation/seed.sql \
     documentation/seed_regras.sql documentation/schema_fts.sql ./

# schema_fts.sql por último: o `rebuild` do FTS5 indexa as linhas que o seed
# já inseriu. Invertida, a ordem gera um índice vazio e /api/ranking devolve
# resultado sem os atos do diário.
RUN sqlite3 licenciamento.db < schema.sql \
    && sqlite3 licenciamento.db < seed.sql \
    && sqlite3 licenciamento.db < seed_regras.sql \
    && sqlite3 licenciamento.db < schema_fts.sql \
    && sqlite3 licenciamento.db "SELECT 'atos indexados: ' || COUNT(*) FROM ato_fts;"

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM node:24-slim

# O layout do repositório é preservado de propósito: backend/tsconfig.json
# mapeia `@/*` -> `../frontend/src/*`, e o backend importa o motor de
# `frontend/src/lib` em vez de reimplementá-lo. Achatar as pastas quebra o boot.
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
# `--include=dev` porque `npm start` é `tsx src/server.ts`, e o tsx é
# devDependency — aqui ele é o runtime, não ferramenta de desenvolvimento.
RUN npm ci --include=dev

COPY backend/ ./

# Alvo do alias `@/*`. Sem isto o processo morre no primeiro import.
COPY frontend/src /app/frontend/src

COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY --from=db /build/licenciamento.db /app/data/db/licenciamento.db

ENV NODE_ENV=production
ENV DB_PATH=/app/data/db/licenciamento.db
ENV FRONTEND_DIST=/app/frontend/dist
# Reusa o geojson que o Vite já copiou para o dist, em vez de duplicar 3,6 MB.
ENV PROCESSOS_GEOJSON=/app/frontend/dist/data/processos.geojson
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
