-- Migration: Password Reset Tokens
-- Stores secure tokens for password reset flow

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT password_reset_tokens_token_key UNIQUE (token)
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE used_at IS NULL AND expires_at > NOW();
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

COMMENT ON TABLE password_reset_tokens IS 'Stores one-time tokens for password reset requests';
COMMENT ON COLUMN password_reset_tokens.token IS 'SHA-256 hashed token (store hash, send plain to email)';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expires after 1 hour by default';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Timestamp when token was used (one-time use)';
