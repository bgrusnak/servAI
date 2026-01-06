-- Migration: Cascading Soft Deletes (FIXES CRIT-004)
-- When company/condo/building is deleted, cascade to children

-- ============================================
-- COMPANY CASCADE DELETE
-- ============================================

CREATE OR REPLACE FUNCTION cascade_company_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when deleted_at changes from NULL to a value
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    
    -- Cascade to condos
    UPDATE condos 
    SET deleted_at = NEW.deleted_at
    WHERE company_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to buildings (via condos)
    UPDATE buildings
    SET deleted_at = NEW.deleted_at
    WHERE condo_id IN (
      SELECT id FROM condos WHERE company_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to units (via buildings)
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE building_id IN (
      SELECT b.id FROM buildings b
      INNER JOIN condos c ON c.id = b.condo_id
      WHERE c.company_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to invites (via units)
    UPDATE invites
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT u.id FROM units u
      INNER JOIN buildings b ON b.id = u.building_id
      INNER JOIN condos c ON c.id = b.condo_id
      WHERE c.company_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to residents (via units)
    UPDATE residents
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT u.id FROM units u
      INNER JOIN buildings b ON b.id = u.building_id
      INNER JOIN condos c ON c.id = b.condo_id
      WHERE c.company_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Deactivate user roles for this company
    UPDATE user_roles
    SET is_active = false
    WHERE company_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded soft delete from company % to all children', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_cascade_delete ON companies;

CREATE TRIGGER company_cascade_delete
AFTER UPDATE OF deleted_at ON companies
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION cascade_company_delete();

COMMENT ON FUNCTION cascade_company_delete() IS 
'Cascades soft delete from company to all related entities: condos, buildings, units, invites, residents, user_roles';

-- ============================================
-- CONDO CASCADE DELETE
-- ============================================

CREATE OR REPLACE FUNCTION cascade_condo_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    
    -- Cascade to buildings
    UPDATE buildings
    SET deleted_at = NEW.deleted_at
    WHERE condo_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to units (via buildings)
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE building_id IN (
      SELECT id FROM buildings WHERE condo_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to invites (via units)
    UPDATE invites
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT u.id FROM units u
      INNER JOIN buildings b ON b.id = u.building_id
      WHERE b.condo_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to residents (via units)
    UPDATE residents
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT u.id FROM units u
      INNER JOIN buildings b ON b.id = u.building_id
      WHERE b.condo_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Deactivate condo-level user roles
    UPDATE user_roles
    SET is_active = false
    WHERE condo_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded soft delete from condo % to all children', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS condo_cascade_delete ON condos;

CREATE TRIGGER condo_cascade_delete
AFTER UPDATE OF deleted_at ON condos
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION cascade_condo_delete();

COMMENT ON FUNCTION cascade_condo_delete() IS 
'Cascades soft delete from condo to buildings, units, invites, residents, user_roles';

-- ============================================
-- BUILDING CASCADE DELETE
-- ============================================

CREATE OR REPLACE FUNCTION cascade_building_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    
    -- Cascade to units
    UPDATE units
    SET deleted_at = NEW.deleted_at
    WHERE building_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to invites (via units)
    UPDATE invites
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT id FROM units WHERE building_id = NEW.id
    ) AND deleted_at IS NULL;
    
    -- Cascade to residents (via units)
    UPDATE residents
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id IN (
      SELECT id FROM units WHERE building_id = NEW.id
    ) AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded soft delete from building % to all children', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS building_cascade_delete ON buildings;

CREATE TRIGGER building_cascade_delete
AFTER UPDATE OF deleted_at ON buildings
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION cascade_building_delete();

COMMENT ON FUNCTION cascade_building_delete() IS 
'Cascades soft delete from building to units, invites, residents';

-- ============================================
-- UNIT CASCADE DELETE
-- ============================================

CREATE OR REPLACE FUNCTION cascade_unit_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    
    -- Cascade to invites
    UPDATE invites
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id = NEW.id AND deleted_at IS NULL;
    
    -- Cascade to residents
    UPDATE residents
    SET deleted_at = NEW.deleted_at, is_active = false
    WHERE unit_id = NEW.id AND deleted_at IS NULL;
    
    RAISE NOTICE 'Cascaded soft delete from unit % to invites and residents', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS unit_cascade_delete ON units;

CREATE TRIGGER unit_cascade_delete
AFTER UPDATE OF deleted_at ON units
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION cascade_unit_delete();

COMMENT ON FUNCTION cascade_unit_delete() IS 
'Cascades soft delete from unit to invites and residents';

-- ============================================
-- USER CASCADE DELETE (Soft)
-- ============================================

CREATE OR REPLACE FUNCTION cascade_user_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    
    -- Deactivate all user roles
    UPDATE user_roles
    SET is_active = false
    WHERE user_id = NEW.id AND deleted_at IS NULL;
    
    -- Deactivate all residents
    UPDATE residents
    SET is_active = false
    WHERE user_id = NEW.id AND deleted_at IS NULL;
    
    -- Revoke all refresh tokens
    UPDATE refresh_tokens
    SET revoked_at = NEW.deleted_at
    WHERE user_id = NEW.id AND deleted_at IS NULL AND revoked_at IS NULL;
    
    RAISE NOTICE 'Cascaded user % deletion to roles, residents, tokens', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_cascade_delete ON users;

CREATE TRIGGER user_cascade_delete
AFTER UPDATE OF deleted_at ON users
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION cascade_user_delete();

COMMENT ON FUNCTION cascade_user_delete() IS 
'When user is deleted, deactivate their roles, residences, and revoke tokens';

-- ============================================
-- TEST CASCADING (Can be removed in production)
-- ============================================

-- To test: 
-- UPDATE companies SET deleted_at = NOW() WHERE id = 'some-company-id';
-- Then check:
-- SELECT COUNT(*) FROM condos WHERE company_id = 'some-company-id' AND deleted_at IS NOT NULL;
-- SELECT COUNT(*) FROM buildings WHERE condo_id IN (SELECT id FROM condos WHERE company_id = 'some-company-id') AND deleted_at IS NOT NULL;
