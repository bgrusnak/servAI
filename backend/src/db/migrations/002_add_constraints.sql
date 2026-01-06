-- Add database constraints to prevent race conditions (fixes CRIT-002)

-- Unique constraint: one active resident per user per unit
CREATE UNIQUE INDEX residents_user_unit_active_unique 
ON residents (user_id, unit_id) 
WHERE is_active = true AND deleted_at IS NULL;

-- Unique constraint: prevent duplicate building numbers per condo
CREATE UNIQUE INDEX buildings_condo_number_unique
ON buildings (condo_id, number)
WHERE deleted_at IS NULL;

-- Unique constraint: prevent duplicate entrance numbers per building
CREATE UNIQUE INDEX entrances_building_number_unique
ON entrances (building_id, number)
WHERE deleted_at IS NULL;

-- Unique constraint: prevent duplicate unit numbers per condo
CREATE UNIQUE INDEX units_condo_number_unique
ON units (condo_id, number)
WHERE deleted_at IS NULL;

-- Index for faster resident lookups
CREATE INDEX residents_user_id_active_idx ON residents (user_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX residents_unit_id_active_idx ON residents (unit_id, is_active) WHERE deleted_at IS NULL;

-- Index for invite lookups
CREATE INDEX invites_unit_id_active_idx ON invites (unit_id, is_active, expires_at) WHERE deleted_at IS NULL;
CREATE INDEX invites_token_idx ON invites (token) WHERE deleted_at IS NULL;
