-- ─────────────────────────────────────────────────────────────
-- Canal do cidadão — modelo CityProtect
--
-- A denúncia do cidadão NÃO entra direto no mapa público.
-- Ela fica "em análise" até que a equipe aprove. Sem isso, basta
-- uma pessoa mal-intencionada para encher o mapa de ocorrências
-- falsas — e aí ninguém confia nem nos dados reais da PRF/INMET.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS citizen_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- o que foi relatado
  type          VARCHAR(30)  NOT NULL,
  description   TEXT         NOT NULL,
  location      VARCHAR(200),
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  occurred_at   TIMESTAMPTZ,

  -- contato OPCIONAL: denúncia anônima é um direito.
  -- Guardamos só se a pessoa quiser retorno.
  contact_email VARCHAR(160),

  -- triagem
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
                -- pending | approved | rejected | duplicate
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,

  -- se aprovada, aponta para o alerta publicado
  published_alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,

  -- controle de abuso: hash do IP, nunca o IP em si.
  -- Permite barrar excesso de envios sem guardar dado pessoal.
  ip_hash       VARCHAR(64),
  user_agent    VARCHAR(200),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_status  ON citizen_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_ip_hash ON citizen_reports(ip_hash, created_at DESC);

COMMENT ON TABLE citizen_reports IS
  'Denúncias do cidadão aguardando triagem. Só aparecem no mapa público após aprovação.';
COMMENT ON COLUMN citizen_reports.ip_hash IS
  'SHA-256 do IP + sal. Serve para limitar excesso de envios sem armazenar o IP.';
COMMENT ON COLUMN citizen_reports.contact_email IS
  'Opcional. Denúncia anônima é permitida — o campo fica nulo nesse caso.';

SELECT 'Canal do cidadão criado.' AS status;
