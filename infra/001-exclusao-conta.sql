-- ─────────────────────────────────────────────────────────────
-- Estrutura para exclusao de conta conforme LGPD (art. 18, VI)
--
-- Decisoes e o porque:
--
-- 1) alerts -> tenants e CASCADE. Apagar o tenant levaria junto os 753
--    alertas de PRF/INMET/delegacias. Sao dados de INTERESSE PUBLICO
--    (art. 16 da LGPD e Lei de Acesso a Informacao), nao pertencem ao
--    usuario. Por isso NUNCA apagamos o tenant nesse fluxo.
--
-- 2) alerts.created_by/assigned_to -> users ja e SET NULL. O banco ja
--    preserva a ocorrencia quando a pessoa sai. Mantemos esse desenho.
--
-- 3) Prazo de 30 dias antes da eliminacao definitiva: protege contra
--    exclusao acidental ou pedido feito por quem invadiu a conta.
-- ─────────────────────────────────────────────────────────────

-- Campos de controle do pedido de exclusao
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ;

-- Comprovante de exclusao — SEM dado pessoal.
-- Serve para demonstrar conformidade se a ANPD ou o titular questionar.
CREATE TABLE IF NOT EXISTS deletion_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- hash do email, nao o email: permite confirmar "este pedido existiu"
  -- sem guardar o dado pessoal que deveria ter sido eliminado
  subject_hash   VARCHAR(64) NOT NULL,
  tenant_id      UUID,
  requested_at   TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method         VARCHAR(20) NOT NULL DEFAULT 'self_service',
  records_kept   INTEGER DEFAULT 0,
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_deletion_log_hash ON deletion_log(subject_hash);

COMMENT ON TABLE deletion_log IS
  'Comprovante de exclusoes (LGPD art.18 VI). Nao contem dado pessoal: o titular e identificado por hash.';
COMMENT ON COLUMN users.deletion_scheduled_at IS
  'Data da eliminacao definitiva. Ate la o pedido pode ser cancelado pelo titular.';

SELECT 'Estrutura criada.' AS status;
