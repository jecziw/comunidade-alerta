-- 2FA / TOTP: segredo gerado e validado no backend
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT;
