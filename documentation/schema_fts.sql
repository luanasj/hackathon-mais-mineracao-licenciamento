-- Índice de texto sobre os atos do diário oficial (FTS5).
--
-- Aplicado DEPOIS de seed.sql: `rebuild` lê as linhas já existentes em
-- ato_diario_oficial, então rodar isto antes do seed produziria um índice vazio.
-- Arquivo separado pelo mesmo motivo de seed_regras.sql — seed.sql é gerado por
-- scripts/generate_seed_sql.py e não se edita à mão.
--
-- Por que existe: o motor de ranking (backend/src/ranking.ts) usava os atos como
-- evidência documental respondendo só "tem ≥1 ato cujo rótulo de coleta não é
-- 'cfem'?". Isso é fraco em duas pontas — não olha o texto, e o rótulo é lossy:
-- scripts/build_dataset.py deduplica por URL e guarda só o primeiro termo em ordem
-- alfabética, e 'cfem' vem primeiro. Dos 486 atos rotulados 'cfem', 133 também
-- casaram 'mineracao'/'licenciamento ambiental' e eram descartados. Buscar no texto
-- torna o rótulo dispensável.
--
-- `content=` (external content): o índice não duplica o texto, aponta para a tabela
-- base. São ~1 MB de excertos; duplicá-los seria desperdício, e a tabela é estática.
--
-- `remove_diacritics 2` é o que faz "Licença" casar com "licenca" — a variante 2
-- (não a 1) trata corretamente caracteres fora do Latin-1.
--
-- Sem triggers de sincronismo, de propósito: ato_diario_oficial só é populada por
-- seed.sql e scripts/build_local_db.sh recria o banco do zero a cada execução.
-- Trigger aqui sugeriria uma escrita em runtime que não existe (o backend abre o
-- banco com readOnly: true).

CREATE VIRTUAL TABLE ato_fts USING fts5(
    excerto,
    content='ato_diario_oficial',
    content_rowid='id',
    tokenize="unicode61 remove_diacritics 2"
);

INSERT INTO ato_fts(ato_fts) VALUES('rebuild');
