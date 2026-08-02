FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir sqlite-web

WORKDIR /app

COPY documentation/schema.sql documentation/seed.sql documentation/seed_regras.sql documentation/
COPY docker/entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["/app/entrypoint.sh"]
