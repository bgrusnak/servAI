-- Migration 004: Remove SERIAL, add soft delete everywhere, add refresh tokens
-- Created: 2026-01-06

-- Remove SERIAL from tickets table and use sequence manually
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_number_key;
ALTER TABLE tickets DROP COLUMN IF EXISTS number;

-- Add ticket number as computed field (year + sequential)
CREATE SEQUENCE IF NOT EXISTS tickets_number_seq;

ALTER TABLE tickets ADD COLUMN number VARCHAR(50) UNIQUE;

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('tickets_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_ticket_number();

-- Add soft delete to tables that don't have it
ALTER TABLE invites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meter_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meter_readings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ticket_status_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_summaries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Update indexes to exclude soft-deleted records
DROP INDEX IF EXISTS idx_invites_unit;
CREATE INDEX idx_invites_unit ON invites(unit_id) WHERE is_active = true AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_invites_token;
CREATE INDEX idx_invites_token ON invites(token) WHERE is_active = true AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_invites_expires;
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE is_active = true AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_meter_types_company;
CREATE INDEX idx_meter_types_company ON meter_types(company_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_meter_types_condo;
CREATE INDEX idx_meter_types_condo ON meter_types(condo_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_meter_readings_unit;
CREATE INDEX idx_meter_readings_unit ON meter_readings(unit_id, reading_date DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_tickets_condo;
CREATE INDEX idx_tickets_condo ON tickets(condo_id, status, created_at DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_tickets_unit;
CREATE INDEX idx_tickets_unit ON tickets(unit_id, created_at DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_tickets_status;
CREATE INDEX idx_tickets_status ON tickets(status, created_at DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_ticket_comments_ticket;
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_notifications_user;
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_telegram_messages_user;
CREATE INDEX idx_telegram_messages_user ON telegram_messages(user_id, created_at DESC) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_files_uploaded_by;
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_user_roles_user;
CREATE INDEX idx_user_roles_user ON user_roles(user_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_user_roles_company;
CREATE INDEX idx_user_roles_company ON user_roles(company_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_user_roles_condo;
CREATE INDEX idx_user_roles_condo ON user_roles(condo_id) WHERE deleted_at IS NULL;

-- Refresh Tokens table
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP WITH TIME ZONE,
  replaced_by UUID REFERENCES refresh_tokens(id),
  ip_address INET,
  user_agent TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE deleted_at IS NULL AND revoked_at IS NULL;

-- Migration table also needs deleted_at for consistency
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
