-- Migration 005: Remove unnecessary ticket number field
-- Created: 2026-01-06
-- UUID is sufficient as primary key, no need for human-readable number

-- Drop trigger and function
DROP TRIGGER IF EXISTS set_ticket_number ON tickets;
DROP FUNCTION IF EXISTS generate_ticket_number();

-- Drop sequence
DROP SEQUENCE IF EXISTS tickets_number_seq;

-- Drop column
ALTER TABLE tickets DROP COLUMN IF EXISTS number;
