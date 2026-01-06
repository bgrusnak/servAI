-- Migration 003: Add missing indexes for foreign keys and performance
-- Created: 2026-01-06
-- These indexes are critical for FK constraint checks and query performance

-- Invites
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by);

-- Meter Readings - FK indexes
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_type_fk ON meter_readings(meter_type_id);

-- Tickets - additional performance indexes
CREATE INDEX IF NOT EXISTS idx_tickets_category_fk ON tickets(category_id);

-- Ticket Comments - FK indexes
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_fk ON ticket_comments(user_id);

-- Ticket Status History - FK indexes  
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_user_fk ON ticket_status_history(changed_by);

-- Notifications - FK index
CREATE INDEX IF NOT EXISTS idx_notifications_user_fk ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type, created_at DESC);

-- Telegram Messages - FK index
CREATE INDEX IF NOT EXISTS idx_telegram_messages_user_fk ON telegram_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_intent ON telegram_messages(intent) WHERE intent IS NOT NULL;

-- Files - FK index
CREATE INDEX IF NOT EXISTS idx_files_user_fk ON files(uploaded_by);

-- Audit Logs - performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- Meter Types - composite index for lookup
CREATE INDEX IF NOT EXISTS idx_meter_types_lookup ON meter_types(company_id, condo_id, code) WHERE is_system = false;

-- Ticket Categories - composite index
CREATE INDEX IF NOT EXISTS idx_ticket_categories_lookup ON ticket_categories(company_id, condo_id, code) WHERE is_system = false;

-- Performance: Index for active residents lookup
CREATE INDEX IF NOT EXISTS idx_residents_active_user ON residents(user_id, is_active) WHERE is_active = true;

-- Performance: Index for recent meter readings
CREATE INDEX IF NOT EXISTS idx_meter_readings_recent ON meter_readings(unit_id, meter_type_id, reading_date DESC);

-- Performance: Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
