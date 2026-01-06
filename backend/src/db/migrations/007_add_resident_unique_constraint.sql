-- Migration: Add unique constraint for active residents (FIXES CRIT-002)
-- Prevents duplicate resident records for same user+unit combination

-- Drop existing constraint if exists (for idempotency)
ALTER TABLE residents DROP CONSTRAINT IF EXISTS residents_user_unit_active_unique;

-- Add partial unique index
-- Only enforces uniqueness when is_active = true AND deleted_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS residents_user_unit_active_unique
ON residents (user_id, unit_id)
WHERE is_active = true AND deleted_at IS NULL;

COMMENT ON INDEX residents_user_unit_active_unique IS 
'Ensures a user can only be an active resident of a unit once. Allows multiple inactive/deleted records for history.';
