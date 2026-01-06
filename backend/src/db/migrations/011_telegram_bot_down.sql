-- Rollback migration: Telegram Bot Infrastructure
-- Created: 2026-01-06
-- Description: Rollback tables for Telegram bot

-- Drop triggers first
DROP TRIGGER IF EXISTS telegram_users_updated_at ON telegram_users;
DROP TRIGGER IF EXISTS intents_updated_at ON intents;
DROP TRIGGER IF EXISTS system_prompts_updated_at ON system_prompts;

-- Drop function
DROP FUNCTION IF EXISTS update_telegram_updated_at();

-- Drop tables (in reverse order due to foreign keys)
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS user_context CASCADE;
DROP TABLE IF EXISTS telegram_users CASCADE;
DROP TABLE IF EXISTS system_prompts CASCADE;
DROP TABLE IF EXISTS intents CASCADE;

-- Remove from schema_migrations
DELETE FROM schema_migrations WHERE version = 11;
