-- Cascading soft delete triggers (fixes CRIT-004)
-- When a parent entity is soft-deleted, all children are automatically soft-deleted

-- ===========================================
-- COMPANY CASCADE
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_company_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when deleted_at changes from NULL to a value
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Cascade to condos
    UPDATE condos 
    SET deleted_at = NEW.deleted_at 
    WHERE company_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to user_roles
    UPDATE user_roles
    SET deleted_at = NEW.deleted_at
    WHERE company_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded company deletion: company_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_cascade_soft_delete ON companies;
CREATE TRIGGER company_cascade_soft_delete
AFTER UPDATE OF deleted_at ON companies
FOR EACH ROW
EXECUTE FUNCTION cascade_company_soft_delete();

-- ===========================================
-- CONDO CASCADE
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_condo_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Cascade to buildings
    UPDATE buildings
    SET deleted_at = NEW.deleted_at
    WHERE condo_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to units (not in buildings)
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE condo_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to user_roles
    UPDATE user_roles
    SET deleted_at = NEW.deleted_at
    WHERE condo_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded condo deletion: condo_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS condo_cascade_soft_delete ON condos;
CREATE TRIGGER condo_cascade_soft_delete
AFTER UPDATE OF deleted_at ON condos
FOR EACH ROW
EXECUTE FUNCTION cascade_condo_soft_delete();

-- ===========================================
-- BUILDING CASCADE
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_building_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Cascade to entrances
    UPDATE entrances
    SET deleted_at = NEW.deleted_at
    WHERE building_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to units
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE building_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded building deletion: building_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS building_cascade_soft_delete ON buildings;
CREATE TRIGGER building_cascade_soft_delete
AFTER UPDATE OF deleted_at ON buildings
FOR EACH ROW
EXECUTE FUNCTION cascade_building_soft_delete();

-- ===========================================
-- ENTRANCE CASCADE
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_entrance_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Cascade to units
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE entrance_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded entrance deletion: entrance_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entrance_cascade_soft_delete ON entrances;
CREATE TRIGGER entrance_cascade_soft_delete
AFTER UPDATE OF deleted_at ON entrances
FOR EACH ROW
EXECUTE FUNCTION cascade_entrance_soft_delete();

-- ===========================================
-- UNIT CASCADE
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_unit_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Cascade to residents
    UPDATE residents
    SET deleted_at = NEW.deleted_at
    WHERE unit_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to invites
    UPDATE invites
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded unit deletion: unit_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS unit_cascade_soft_delete ON units;
CREATE TRIGGER unit_cascade_soft_delete
AFTER UPDATE OF deleted_at ON units
FOR EACH ROW
EXECUTE FUNCTION cascade_unit_soft_delete();

-- ===========================================
-- USER CASCADE (deactivate roles)
-- ===========================================

CREATE OR REPLACE FUNCTION cascade_user_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Deactivate all user roles
    UPDATE user_roles
    SET is_active = false, deleted_at = NEW.deleted_at
    WHERE user_id = NEW.id AND deleted_at IS NULL;
    
    -- Soft delete residents
    UPDATE residents
    SET deleted_at = NEW.deleted_at
    WHERE user_id = NEW.id AND deleted_at IS NULL;
    
    -- Revoke all refresh tokens
    UPDATE refresh_tokens
    SET revoked_at = NEW.deleted_at
    WHERE user_id = NEW.id AND revoked_at IS NULL AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded user deletion: user_id=%', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_cascade_soft_delete ON users;
CREATE TRIGGER user_cascade_soft_delete
AFTER UPDATE OF deleted_at ON users
FOR EACH ROW
EXECUTE FUNCTION cascade_user_soft_delete();

-- ===========================================
-- AUDIT LOG for cascading deletes
-- ===========================================

CREATE TABLE IF NOT EXISTS cascade_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  parent_type VARCHAR(50),
  parent_id UUID,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX cascade_audit_log_entity_idx ON cascade_audit_log (entity_type, entity_id);
CREATE INDEX cascade_audit_log_parent_idx ON cascade_audit_log (parent_type, parent_id);
CREATE INDEX cascade_audit_log_deleted_at_idx ON cascade_audit_log (deleted_at);
