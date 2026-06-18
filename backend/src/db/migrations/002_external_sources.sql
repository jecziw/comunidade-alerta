-- =============================================================
-- Migration 002: External Data Sources
-- Adiciona campos para alertas de fontes externas (PRF, AlertaSC)
-- e atualiza schema para o novo frontend
-- =============================================================

BEGIN;

-- ── Novos campos na tabela alerts ──────────────────────────────
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS source       VARCHAR(50)     DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS external_id  VARCHAR(150)    UNIQUE,
  ADD COLUMN IF NOT EXISTS severity     VARCHAR(20)     DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS latitude     DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS longitude    DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS raw_data     TEXT,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ     DEFAULT NOW();

-- ── Índices para performance nas queries de mapa e filtros ────
CREATE INDEX IF NOT EXISTS idx_alerts_source
  ON alerts(source);

CREATE INDEX IF NOT EXISTS idx_alerts_external_id
  ON alerts(external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_severity
  ON alerts(severity);

CREATE INDEX IF NOT EXISTS idx_alerts_coords
  ON alerts(latitude, longitude) WHERE latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_source
  ON alerts(tenant_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status
  ON alerts(tenant_id, status, created_at DESC);

-- ── Trigger: atualiza updated_at automaticamente ───────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alerts_updated_at ON alerts;
CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Tabela de sync de fontes externas (auditoria) ─────────────
CREATE TABLE IF NOT EXISTS external_sync_log (
  id          SERIAL PRIMARY KEY,
  source      VARCHAR(50)  NOT NULL,          -- 'prf' | 'alertasc'
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fetched     INTEGER      DEFAULT 0,         -- total encontrados
  inserted    INTEGER      DEFAULT 0,         -- novos inseridos
  skipped     INTEGER      DEFAULT 0,         -- já existiam
  error_msg   TEXT,
  status      VARCHAR(20)  DEFAULT 'running'  -- running|success|error
);

CREATE INDEX IF NOT EXISTS idx_sync_log_source_tenant
  ON external_sync_log(source, tenant_id, started_at DESC);

-- ── View: alertas com info de fonte para o frontend ───────────
CREATE OR REPLACE VIEW alerts_with_source AS
SELECT
  a.*,
  CASE a.source
    WHEN 'prf'      THEN 'Polícia Rodoviária Federal'
    WHEN 'alertasc' THEN 'Defesa Civil SC / AlertaSC'
    WHEN 'cemaden'  THEN 'CEMADEN'
    ELSE                 'Usuário'
  END AS source_label,
  CASE a.source
    WHEN 'prf'      THEN '#FF8F00'
    WHEN 'alertasc' THEN '#0288D1'
    ELSE                 NULL
  END AS source_color,
  (a.source != 'interno') AS is_external
FROM alerts a;

-- ── Constraint: external_id único por tenant (não globalmente) ─
-- (O UNIQUE global foi substituído por índice parcial mais flexível)
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_external_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_external_tenant
  ON alerts(tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- ── Adicionar tipo 'feminicidio' ao check de type (se existir) ─
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check'
      AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'crime', 'furto', 'transito', 'infra', 'outro',
      'feminicidio', 'prf', 'alertasc'
    ));
END;
$$;

-- ── Seed: atualiza alertas existentes sem source ──────────────
UPDATE alerts
SET source = 'interno'
WHERE source IS NULL OR source = '';

COMMIT;

/*
  Para rodar:
    psql $DATABASE_URL -f 002_external_sources.sql

  Ou via pool no backend:
    node -e "require('./src/db').pool.query(require('fs').readFileSync('src/db/migrations/002_external_sources.sql','utf8')).then(()=>process.exit())"
*/
