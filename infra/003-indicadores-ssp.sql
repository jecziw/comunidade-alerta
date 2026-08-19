-- ─────────────────────────────────────────────────────────────
-- Indicadores oficiais da SSP/SC
--
-- POR QUE TABELA SEPARADA, E NAO EM 'alerts':
-- Este dado e MENSAL e AGREGADO por municipio — nao tem coordenada
-- nem hora de ocorrencia. Se entrasse em 'alerts', apareceria como
-- ponto no mapa, o que exigiria inventar uma localizacao que o dado
-- nao possui. Aqui ele serve ao que realmente e: contexto estatistico,
-- comparativo e camada por municipio.
--
-- FONTE: https://ssp.sc.gov.br/segurancaemnumeros/
--        Gerencia de Estatistica e Analise Criminal — SSP/SC
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ssp_indicadores (
  id          BIGSERIAL PRIMARY KEY,
  municipio   VARCHAR(120) NOT NULL,
  fato        VARCHAR(160) NOT NULL,   -- Ameaca, Injuria, Lesao corporal...
  ano         INTEGER      NOT NULL,
  mes         INTEGER      NOT NULL CHECK (mes BETWEEN 1 AND 12),
  total       INTEGER      NOT NULL CHECK (total >= 0),
  fonte       VARCHAR(40)  NOT NULL DEFAULT 'ssp-sc',
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (municipio, fato, ano, mes, fonte)
);

CREATE INDEX IF NOT EXISTS idx_ssp_muni ON ssp_indicadores(municipio, ano, mes);
CREATE INDEX IF NOT EXISTS idx_ssp_fato ON ssp_indicadores(fato, ano);

COMMENT ON TABLE ssp_indicadores IS
  'Indicadores mensais agregados da SSP/SC. Dado estatistico por municipio — NAO e ocorrencia individual e NAO vai para o mapa como ponto.';
COMMENT ON COLUMN ssp_indicadores.total IS
  'Quantidade de registros no municipio naquele mes, conforme boletim oficial.';

SELECT 'Tabela de indicadores criada.' AS status;
