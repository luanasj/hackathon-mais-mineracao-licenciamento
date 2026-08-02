-- =====================================================================
-- Schema do banco de dados — Motor de Enquadramento Licenciatório
-- Baseado nos JSON reais em data/processed/ (SQLite)
--
-- Fontes:
--   data/processed/cepram_divisao_b_mineracao.json
--   data/processed/consorcios.json
--   data/processed/gac_habilitacao.json / municipios_habilitados.json
--     (mesmo conteúdo — municipios_habilitados.json é a lista mestra;
--      gac_habilitacao.json é gerado a partir dela por build_dataset.py.
--      Modelados como UMA tabela: habilitacao_gac.)
--   data/processed/leis_por_municipio.json
--   data/processed/licencas/<run_id>.json  (produto do research_pipeline,
--     um arquivo por rodada trimestral -> pesquisa_run + licenca)
--
-- Fora deste schema, por decisão de escopo: entidades ainda sem JSON real
-- (Regra de competência, Parecer) e os JSON brutos por termo em
-- data/raw/querido_diario/*.json (pré-consolidação, já representados por
-- leis_por_municipio.json / ato_diario_oficial abaixo).
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Base geográfica / institucional
-- ---------------------------------------------------------------------

CREATE TABLE consorcio (
    consorcio_id        TEXT PRIMARY KEY,   -- ex.: "10152"
    nome                 TEXT NOT NULL
);

CREATE TABLE municipio (
    codigo_ibge          TEXT PRIMARY KEY,   -- ex.: "2900108"
    nome                 TEXT NOT NULL
);

-- Checagem manual de habilitação GAC — append-only por desenho:
-- cada linha é UMA consulta (fonte_url + data_consulta obrigatórios).
-- "Situação atual" = linha de maior data_consulta por município
-- (ver view municipio_habilitacao_atual).
CREATE TABLE habilitacao_gac (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_ibge          TEXT NOT NULL REFERENCES municipio(codigo_ibge),
    consorcio_id         TEXT REFERENCES consorcio(consorcio_id),   -- NULL = não vinculado a consórcio
    nivel                TEXT CHECK (nivel IN ('1', '2', '3')),      -- NULL quando não habilitado
    status               TEXT NOT NULL CHECK (status IN ('habilitado', 'nao_habilitado', 'sem_evidencia')),
    situacao_gac         TEXT NOT NULL,      -- texto cru do portal: "CAPAZ", "NÃO CAPAZ"...
    data_publicacao      TEXT,               -- data do ato de habilitação (formato origem DD/MM/AAAA)
    fonte_url            TEXT NOT NULL,
    data_consulta        TEXT NOT NULL       -- AAAA-MM-DD
);

CREATE INDEX idx_habilitacao_gac_municipio ON habilitacao_gac(codigo_ibge);

-- Situação vigente por município (a última consulta registrada)
CREATE VIEW municipio_habilitacao_atual AS
SELECT h.*
FROM habilitacao_gac h
WHERE h.data_consulta = (
    SELECT MAX(h2.data_consulta)
    FROM habilitacao_gac h2
    WHERE h2.codigo_ibge = h.codigo_ibge
);

-- ---------------------------------------------------------------------
-- Tipologias CEPRAM (Resolução 4.327/2013, Anexo Único, Divisão B)
-- ---------------------------------------------------------------------

-- Metadado da fonte normativa — uma linha (documento-base de todo o bloco).
CREATE TABLE fonte_cepram (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    resolucao            TEXT NOT NULL,
    publicacao           TEXT NOT NULL,
    arquivo_fonte        TEXT NOT NULL,
    secao                TEXT NOT NULL,
    paginas_fonte        TEXT,
    data_extracao        TEXT NOT NULL,
    metodo               TEXT,
    verificado           INTEGER NOT NULL CHECK (verificado IN (0, 1))
);

CREATE TABLE tipologia_grupo (
    codigo               TEXT PRIMARY KEY,   -- "B1".."B4"
    divisao              TEXT NOT NULL,      -- "B"
    nome                 TEXT NOT NULL,
    status               TEXT NOT NULL CHECK (status IN ('presente', 'ausente_no_documento')),
    nota                 TEXT,
    fonte_id             INTEGER NOT NULL REFERENCES fonte_cepram(id)
);

CREATE TABLE tipologia (
    codigo                          TEXT PRIMARY KEY,   -- "B3.1"
    grupo_codigo                    TEXT NOT NULL REFERENCES tipologia_grupo(codigo),
    nome                             TEXT NOT NULL,
    unidade_medida_porte             TEXT NOT NULL,      -- "Produção Bruta de Minério (t/ano)"
    potencial_poluidor               TEXT NOT NULL,       -- "M" | "A" (conforme fonte; sem CHECK — grupos B1/B2 ausentes podem trazer outro valor)
    porte_pequeno_raw                TEXT,                -- texto original, ex. "< 75.000"
    porte_pequeno_limite_superior    NUMERIC,             -- 75000
    porte_medio_raw                  TEXT,
    porte_medio_limite_inferior      NUMERIC,
    porte_medio_limite_superior      NUMERIC,
    porte_grande_raw                 TEXT,
    porte_grande_limite_inferior     NUMERIC,
    pagina_fonte                     TEXT,                -- string: pode ser "14-15"
    nota                              TEXT,
    fonte_id                          INTEGER NOT NULL REFERENCES fonte_cepram(id)
);

CREATE INDEX idx_tipologia_grupo ON tipologia(grupo_codigo);

-- Quais classes de impacto (ver classe_impacto) cada nível de gestão
-- municipal (Art. 7º) pode licenciar, por tipologia.
CREATE TABLE tipologia_nivel_gestao (
    tipologia_codigo     TEXT NOT NULL REFERENCES tipologia(codigo),
    nivel                INTEGER NOT NULL CHECK (nivel IN (1, 2, 3)),
    classes_autorizadas  TEXT,               -- texto cru, ex. "C1 e C3"; NULL = nível não autoriza esta tipologia
    PRIMARY KEY (tipologia_codigo, nivel)
);

-- Matriz do Art. 3º, parágrafo único: Classe = f(porte, potencial poluidor geral)
CREATE TABLE classe_impacto (
    porte                TEXT NOT NULL CHECK (porte IN ('pequeno', 'medio', 'grande')),
    potencial_poluidor   TEXT NOT NULL CHECK (potencial_poluidor IN ('pequeno', 'medio', 'alto')),
    classe               TEXT NOT NULL,      -- "Classe 1".."Classe 6"
    fundamento            TEXT NOT NULL,
    PRIMARY KEY (porte, potencial_poluidor)
);

-- ---------------------------------------------------------------------
-- Evidência documental (Querido Diário) — leis_por_municipio.json
-- ---------------------------------------------------------------------

CREATE TABLE termo_busca (
    termo                TEXT PRIMARY KEY   -- "cfem" | "extracao mineral" | "licenciamento ambiental" | "mineracao" (grafia exata do dado, com espaço)
);

-- Quais termos foram pesquisados para cada município (metadado da coleta,
-- independente de ter encontrado ato ou não).
CREATE TABLE municipio_termo_busca (
    codigo_ibge          TEXT NOT NULL REFERENCES municipio(codigo_ibge),
    termo                TEXT NOT NULL REFERENCES termo_busca(termo),
    PRIMARY KEY (codigo_ibge, termo)
);

CREATE TABLE ato_diario_oficial (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_ibge           TEXT NOT NULL REFERENCES municipio(codigo_ibge),
    termo                 TEXT NOT NULL REFERENCES termo_busca(termo),  -- termo_encontrado
    url                   TEXT NOT NULL,
    txt_url               TEXT,
    data_ato              TEXT,              -- AAAA-MM-DD; NULL se a fonte não trouxer data confiável
    edicao                TEXT,
    excerto               TEXT NOT NULL,
    data_coleta           TEXT NOT NULL,      -- AAAA-MM-DD
    fonte                 TEXT NOT NULL,      -- URL da API (Querido Diário)
    confirmado_manualmente INTEGER NOT NULL DEFAULT 0 CHECK (confirmado_manualmente IN (0, 1)),
    UNIQUE (url, termo)
);

CREATE INDEX idx_ato_municipio ON ato_diario_oficial(codigo_ibge);
CREATE INDEX idx_ato_termo ON ato_diario_oficial(termo);

-- ---------------------------------------------------------------------
-- Licenças concedidas — produto do research_pipeline (Gemini Deep Research
-- + DeepSeek). Fonte: data/processed/licencas/<run_id>.json, um arquivo por
-- rodada.
--
-- Append-only, mesma forma de habilitacao_gac: cada rodada trimestral
-- ACRESCENTA um pesquisa_run e suas licenças, nunca sobrescreve as
-- anteriores. É isso que torna a comparação entre trimestres possível —
-- um UPSERT por licença apagaria a série histórica que se quer medir.
-- ---------------------------------------------------------------------

CREATE TABLE pesquisa_run (
    run_id               TEXT PRIMARY KEY,   -- "2025_20260802T012043Z" (ano + timestamp UTC)
    ano_referencia       INTEGER NOT NULL,
    -- 0 quando a rodada cobriu um ano ainda em curso: a de 2026 rodada em
    -- agosto/2026 traz Jan-Ago, e comparar a contagem dela com a de um ano
    -- fechado sem esta coluna produziria a leitura errada de "queda".
    ano_completo         INTEGER NOT NULL CHECK (ano_completo IN (0, 1)),
    gerado_em            TEXT NOT NULL,      -- AAAA-MM-DDTHH:MM:SSZ, derivado do run_id
    prompt_version       TEXT NOT NULL,      -- "deep_research_v1"
    modelo_pesquisa      TEXT NOT NULL,      -- "deep-research-preview-04-2026" | "relatorio_salvo"
    modelo_estruturacao  TEXT NOT NULL,      -- "deepseek-v4-flash" | "fixture"
    refs_data_consulta   TEXT NOT NULL,      -- snapshot do GAC usado na normalização
    total_licencas       INTEGER NOT NULL,
    municipios_com_licenca INTEGER NOT NULL
);

CREATE TABLE licenca (
    id                   TEXT NOT NULL,      -- slug, único dentro do run: "2025-caturama-lau-01"
    run_id               TEXT NOT NULL REFERENCES pesquisa_run(run_id),

    -- NULL quando o match de nome ficou abaixo do piso de 0.60 (decisão E):
    -- "Bacia do Paramirim (Região)" não é município e não pode virar um.
    codigo_ibge          TEXT REFERENCES municipio(codigo_ibge),
    municipio_nome       TEXT,
    municipio_raw        TEXT NOT NULL,      -- como o relatório escreveu
    municipio_match_metodo TEXT NOT NULL CHECK (municipio_match_metodo IN ('exato', 'alias', 'fuzzy', 'inferido', 'nenhum')),
    municipio_match_confianca NUMERIC NOT NULL,

    consorcio_id         TEXT REFERENCES consorcio(consorcio_id),
    consorcio_nome       TEXT,
    consorcio_raw        TEXT,
    consorcio_match_metodo TEXT NOT NULL CHECK (consorcio_match_metodo IN ('exato', 'alias', 'fuzzy', 'inferido', 'nenhum')),
    consorcio_match_confianca NUMERIC NOT NULL,

    -- Nunca deduzido do vínculo consorcial: exige evidência textual (§6.4).
    licenciado_por       TEXT NOT NULL CHECK (licenciado_por IN ('municipio_proprio', 'consorcio', 'indeterminado')),
    orgao_emissor_raw    TEXT,
    licenciado_por_evidencia TEXT,
    licenciado_por_confianca NUMERIC NOT NULL,

    titular              TEXT,
    mineral              TEXT,
    substancia_raw       TEXT,
    -- SEM foreign key para tipologia(codigo), e não por descuido: o
    -- vocabulário do research_pipeline vem do Anexo IV completo (17 códigos)
    -- e o seed.sql carrega só os 9 dos grupos B3/B4 extraídos do PDF. Medido:
    -- B1.1.1, B1.1.2, B1.1.3, B1.2.1, B2.1, B2.2, B4.5 e B4.6 existem no
    -- pipeline e não no banco — e a licença de Nordestina/2025 saiu com B2.2.
    -- Uma FK aqui rejeitaria licenças reais para proteger uma tabela que está
    -- incompleta; a incompletude é da tabela, não do dado.
    tipologia_codigo     TEXT,
    tipologia_nome       TEXT,
    potencial_poluidor   TEXT,
    nivel_licenciamento  INTEGER CHECK (nivel_licenciamento IN (1, 2, 3)),

    -- 'Outra' não é uma sétima modalidade: é "fora das 6 do vocabulário".
    -- Quem lê 'Outra' tem de ler modalidade_raw junto — é lá que está o que a
    -- prefeitura escreveu ("Licença Específica", "Licença de Alteração").
    modalidade           TEXT CHECK (modalidade IN ('LP', 'LI', 'LO', 'LAU', 'LU', 'Renovacao', 'Outra')),
    modalidade_raw       TEXT,
    numero_licenca       TEXT,
    data_concessao       TEXT,               -- AAAA-MM-DD; NULL se a fonte não traz data completa

    fonte_urls           TEXT NOT NULL,      -- JSON array: SQLite não tem lista e o §8 exige todas
    trecho_citado        TEXT NOT NULL,      -- procedência obrigatória (AC2)
    data_consulta        TEXT NOT NULL,      -- data do run, não do cadastro
    verificado           INTEGER NOT NULL DEFAULT 0 CHECK (verificado IN (0, 1)),

    PRIMARY KEY (run_id, id)
);

CREATE INDEX idx_licenca_municipio ON licenca(codigo_ibge);
CREATE INDEX idx_licenca_run ON licenca(run_id);

-- Avisos agregados do manifesto, um por código. Sem eles a comparação entre
-- trimestres mostra que uma contagem mudou e não mostra por quê.
CREATE TABLE pesquisa_aviso (
    run_id               TEXT NOT NULL REFERENCES pesquisa_run(run_id),
    codigo               TEXT NOT NULL,      -- "consorcio_match_confianca", "municipio_nao_apto"...
    detalhe              TEXT NOT NULL,      -- texto agregado: "... em N registro(s)"
    PRIMARY KEY (run_id, codigo)
);

-- Superfície de comparação entre rodadas: contagem por município e ano,
-- discriminada por quem licenciou.
CREATE VIEW licenca_por_municipio_ano AS
SELECT
    r.run_id,
    r.ano_referencia,
    r.ano_completo,
    l.codigo_ibge,
    l.municipio_nome,
    l.licenciado_por,
    COUNT(*) AS total_licencas
FROM licenca l
JOIN pesquisa_run r ON r.run_id = l.run_id
GROUP BY r.run_id, r.ano_referencia, r.ano_completo, l.codigo_ibge, l.municipio_nome, l.licenciado_por;

-- ---------------------------------------------------------------------
-- Seed do vocabulário fechado de termos
-- ---------------------------------------------------------------------

INSERT INTO termo_busca (termo) VALUES
    ('cfem'), ('extracao mineral'), ('licenciamento ambiental'), ('mineracao');
