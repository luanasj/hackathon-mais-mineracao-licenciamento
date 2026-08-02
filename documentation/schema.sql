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
-- Regras de competência (Escopo D) — modelo relacional do tipo `Regra`
-- congelado em frontend/src/lib/schemas.ts. O backend lê direto daqui em
-- vez de importar frontend/src/data/fixtures.ts — nova lei de competência
-- vira INSERT nestas 3 tabelas, nunca uma `Regra` nova escrita em TS.
-- ---------------------------------------------------------------------

CREATE TABLE regra (
    id                          TEXT PRIMARY KEY,
    descricao                   TEXT NOT NULL,
    instancia                   TEXT NOT NULL CHECK (instancia IN ('UNIAO', 'ESTADUAL', 'MUNICIPAL', 'INDETERMINADA')),
    orgao                       TEXT NOT NULL CHECK (orgao IN ('IBAMA', 'INEMA', 'MUNICIPIO', 'ANM', 'INDETERMINADO')),
    precedencia                 INTEGER,               -- NULL = usa PRECEDENCIA[instancia] default do motor (D.3)
    torna_condicional           INTEGER NOT NULL DEFAULT 0 CHECK (torna_condicional IN (0, 1)),
    exige_fato                  TEXT,                  -- JSON array de chaves do FactBase; NULL = nenhuma
    trilhas_elegiveis           TEXT,                  -- JSON array de ModalidadeTrilha; NULL = ainda não usado (Escopo E)
    anuencias                   TEXT,                  -- JSON array de IDs de Anuencia; NULL = ainda não usado (Escopo C.7)
    fundamento_norma            TEXT NOT NULL,
    fundamento_dispositivo      TEXT NOT NULL,
    fundamento_verificado       INTEGER NOT NULL CHECK (fundamento_verificado IN (0, 1)),
    fundamento_data_conferencia TEXT,
    prioridade                  TEXT CHECK (prioridade IN ('P0', 'P1', 'P2'))
);

-- Condições de uma regra — AND implícito (D.2). `ordem` fixa a ordem de
-- avaliação exibida no rastro de execução (D.6).
CREATE TABLE regra_condicao (
    regra_id  TEXT NOT NULL REFERENCES regra(id),
    ordem     INTEGER NOT NULL,
    fato      TEXT NOT NULL,
    operador  TEXT NOT NULL CHECK (operador IN ('igual', 'em', 'contem', 'maior', 'menor', 'entre', 'existe')),
    valor     TEXT,             -- JSON-encoded ValorFato (string/número/booleano/array/[min,max])
    negado    INTEGER NOT NULL DEFAULT 0 CHECK (negado IN (0, 1)),
    PRIMARY KEY (regra_id, ordem)
);

-- Alertas emitidos quando a regra dispara (efeito.alertas)
CREATE TABLE regra_alerta (
    regra_id   TEXT NOT NULL REFERENCES regra(id),
    ordem      INTEGER NOT NULL,
    alerta_id  TEXT NOT NULL,
    severidade TEXT NOT NULL CHECK (severidade IN ('info', 'atencao', 'critico')),
    titulo     TEXT NOT NULL,
    detalhe    TEXT NOT NULL,
    PRIMARY KEY (regra_id, ordem)
);

CREATE INDEX idx_regra_condicao_regra ON regra_condicao(regra_id);
CREATE INDEX idx_regra_alerta_regra ON regra_alerta(regra_id);

-- ---------------------------------------------------------------------
-- Seed do vocabulário fechado de termos
-- ---------------------------------------------------------------------

INSERT INTO termo_busca (termo) VALUES
    ('cfem'), ('extracao mineral'), ('licenciamento ambiental'), ('mineracao');
