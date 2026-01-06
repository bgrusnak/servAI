-- Migration: Email Verification
-- Add email verification fields and tokens table

-- Add email verification fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) WHERE email_verified = false;

COMMENT ON COLUMN users.email_verified IS 'Whether user has verified their email address';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when email was verified';

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT email_verification_tokens_token_key UNIQUE (token)
);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token) WHERE used_at IS NULL AND expires_at > NOW();
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

COMMENT ON TABLE email_verification_tokens IS 'Stores one-time tokens for email verification';
COMMENT ON COLUMN email_verification_tokens.token IS 'SHA-256 hashed token';
COMMENT ON COLUMN email_verification_tokens.expires_at IS 'Token expires after 24 hours by default';
