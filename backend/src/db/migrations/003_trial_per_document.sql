-- ════════════════════════════════════════════════════════════
-- Migration 003: Controle de trial por CNPJ/CPF
-- Garante a regra dos Termos de Uso: "Cada CNPJ/CPF tem direito a
-- apenas 1 (um) período de trial por plano".
-- ════════════════════════════════════════════════════════════

-- Documento fiscal do contratante (CPF ou CNPJ, só dígitos)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj_cpf VARCHAR(14);

-- Índice para checagem rápida de trial já usado por documento
CREATE INDEX IF NOT EXISTS idx_tenants_cnpj_cpf ON tenants(cnpj_cpf);

-- Histórico de trials por documento (auditoria e prova da regra)
CREATE TABLE IF NOT EXISTS trial_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cnpj_cpf    VARCHAR(14) NOT NULL,
  plan        VARCHAR(50) NOT NULL,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cnpj_cpf, plan)          -- 1 trial por documento POR PLANO
);

CREATE INDEX IF NOT EXISTS idx_trial_history_doc ON trial_history(cnpj_cpf);
