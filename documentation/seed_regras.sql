-- Seed das regras de competência (Escopo D), extraídas manualmente de
-- frontend/src/data/fixtures.ts (REGRAS) em 2026-08-01 — a última vez em que
-- essas 6 regras existiram só como literal TypeScript. A partir daqui, nova
-- regra de competência é INSERT nestas 3 tabelas, não código.
--
-- Arquivo separado (não dentro de seed.sql, que é gerado por
-- scripts/generate_seed_sql.py a partir de data/processed/ e não deve ser
-- editado à mão) — aplicado uma vez ao banco já existente, sem recriar nada.
BEGIN TRANSACTION;

INSERT INTO regra (id, descricao, instancia, orgao, precedencia, torna_condicional, exige_fato, trilhas_elegiveis, anuencias, fundamento_norma, fundamento_dispositivo, fundamento_verificado, fundamento_data_conferencia, prioridade) VALUES
('federal-substancia-nuclear', 'Minério de urânio atrai a competência federal, qualquer que seja o porte', 'UNIAO', 'IBAMA', NULL, 0, NULL, NULL, NULL, 'LC 140/2011', 'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"', 0, NULL, 'P0'),
('federal-substancia-radioativa-torio', 'Minério de tório atrai a competência federal, qualquer que seja o porte', 'UNIAO', 'IBAMA', NULL, 0, NULL, NULL, NULL, 'LC 140/2011', 'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"', 0, NULL, 'P0'),
('federal-substancia-radioativa-monazita', 'Monazita (areia monazítica, radioativa por conter tório/urânio associados) atrai a competência federal, qualquer que seja o porte', 'UNIAO', 'IBAMA', NULL, 0, NULL, NULL, NULL, 'LC 140/2011', 'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"', 0, NULL, 'P0'),
('municipal-habilitado-tipologia-delegada', 'Município habilitado, com a tipologia entre as delegadas e porte dentro da faixa local', 'MUNICIPAL', 'MUNICIPIO', NULL, 0, '["municipio_status","faixa_porte"]', NULL, NULL, 'LC 140/2011 c/c Resolução CEPRAM 4.327/2013', 'LC 140/2011 Art. 9º, XIV, "a" (competência municipal para impacto local, "conforme tipologia definida pelos respectivos Conselhos Estaduais de Meio Ambiente") c/c CEPRAM 4.327/2013 Art. 2º §2º e Art. 7º (delegação de níveis de gestão ambiental compartilhada ao município, condicionada à comunicação à SEMA)', 0, NULL, 'P0'),
('estadual-porte-acima-da-faixa-delegada', 'Porte acima da faixa delegada ao município: a competência permanece com o Estado', 'ESTADUAL', 'INEMA', NULL, 0, '["faixa_porte"]', NULL, NULL, 'LC 140/2011', 'Art. 8º, XIV — compete aos Estados licenciar "atividades ou empreendimentos utilizadores de recursos ambientais, efetiva ou potencialmente poluidores ou capazes, sob qualquer forma, de causar degradação ambiental, ressalvado o disposto nos arts. 7º e 9º" — competência remanescente do Estado quando não há atribuição federal (Art. 7º) nem delegação municipal efetiva (Art. 9º)', 0, NULL, 'P0'),
('condicional-divisa-status-divergente', 'Poligonal repartida entre municípios com status de habilitação divergente', 'INDETERMINADA', 'INDETERMINADO', NULL, 1, NULL, NULL, NULL, 'Critério interno do motor (D.5)', 'Não é competência normativa externa — é a regra de honestidade do produto: ausência de habilitação uniforme sob a mesma poligonal nunca vira chute de competência, sempre INDETERMINADO + pedido LAI.', 1, '2026-08-01', 'P0');

INSERT INTO regra_condicao (regra_id, ordem, fato, operador, valor, negado) VALUES
('federal-substancia-nuclear', 1, 'substancia', 'contem', '"URÂNIO"', 0),
('federal-substancia-radioativa-torio', 1, 'substancia', 'contem', '"TÓRIO"', 0),
('federal-substancia-radioativa-monazita', 1, 'substancia', 'contem', '"MONAZITA"', 0),
('municipal-habilitado-tipologia-delegada', 1, 'municipio_status', 'igual', '"habilitado"', 0),
('municipal-habilitado-tipologia-delegada', 2, 'tipologia_delegada_ao_municipio', 'igual', 'true', 0),
('municipal-habilitado-tipologia-delegada', 3, 'faixa_porte', 'em', '["pequeno"]', 0),
('municipal-habilitado-tipologia-delegada', 4, 'cruza_divisa', 'igual', 'false', 0),
('estadual-porte-acima-da-faixa-delegada', 1, 'faixa_porte', 'em', '["medio","grande"]', 0),
('estadual-porte-acima-da-faixa-delegada', 2, 'status_municipais_divergentes', 'igual', 'false', 0),
('condicional-divisa-status-divergente', 1, 'cruza_divisa', 'igual', 'true', 0),
('condicional-divisa-status-divergente', 2, 'status_municipais_divergentes', 'igual', 'true', 0);

INSERT INTO regra_alerta (regra_id, ordem, alerta_id, severidade, titulo, detalhe) VALUES
('federal-substancia-nuclear', 1, 'nuclear-cnen', 'critico', 'Atividade nuclear', 'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.'),
('federal-substancia-radioativa-torio', 1, 'nuclear-cnen', 'critico', 'Atividade nuclear', 'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.'),
('federal-substancia-radioativa-monazita', 1, 'nuclear-cnen', 'critico', 'Atividade nuclear', 'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.'),
('condicional-divisa-status-divergente', 1, 'divisa-divergente', 'atencao', 'Competência não determinável com os fatos disponíveis', 'A poligonal atinge municípios com habilitação divergente ou desconhecida.');

COMMIT;
