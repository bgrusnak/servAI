-- Add vehicle settings to condos table
-- Migration: add_vehicle_settings_to_condo
-- Date: 2026-01-07

ALTER TABLE condos
ADD COLUMN IF NOT EXISTS max_vehicles_per_unit INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS temporary_pass_duration_hours INTEGER DEFAULT 24;

-- Add check constraints
ALTER TABLE condos
ADD CONSTRAINT check_max_vehicles_per_unit CHECK (max_vehicles_per_unit >= 1 AND max_vehicles_per_unit <= 10);

ALTER TABLE condos
ADD CONSTRAINT check_temporary_pass_duration CHECK (temporary_pass_duration_hours >= 1 AND temporary_pass_duration_hours <= 168);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_condos_vehicle_settings ON condos(max_vehicles_per_unit, temporary_pass_duration_hours);

-- Add comment
COMMENT ON COLUMN condos.max_vehicles_per_unit IS 'Maximum number of permanent vehicles allowed per unit (1-10)';
COMMENT ON COLUMN condos.temporary_pass_duration_hours IS 'Duration in hours for temporary vehicle passes (1-168, max 1 week)';
