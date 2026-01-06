-- Initial Schema Migration
-- servAI Platform Database Schema v1.0
-- Created: 2026-01-06

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies (Management Companies - УК)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  inn VARCHAR(50),
  kpp VARCHAR(50),
  address TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  is_blocked BOOLEAN DEFAULT false,
  blocked_at TIMESTAMP WITH TIME ZONE,
  blocked_reason TEXT,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(inn)
);

CREATE INDEX idx_companies_is_active ON companies(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_stripe ON companies(stripe_customer_id);

-- Condos (Residential Complexes - ЖК)
CREATE TABLE condos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Russia',
  total_buildings INT DEFAULT 0,
  total_units INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_condos_company ON condos(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_condos_is_active ON condos(is_active) WHERE deleted_at IS NULL;

-- Buildings (Корпуса)
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  total_floors INT,
  total_entrances INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(condo_id, number)
);

CREATE INDEX idx_buildings_condo ON buildings(condo_id);

-- Entrances (Подъезды)
CREATE TABLE entrances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  total_floors INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(building_id, number)
);

CREATE INDEX idx_entrances_building ON entrances(building_id);

-- Unit Types (Типы объектов)
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_residential BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

-- System unit types
INSERT INTO unit_types (name, code, is_residential, is_system, company_id) VALUES
  ('Жилая квартира', 'residential', true, true, NULL),
  ('Коммерческое помещение', 'commercial', false, true, NULL),
  ('Парковочное место', 'parking', false, true, NULL),
  ('Кладовая', 'storage', false, true, NULL);

CREATE INDEX idx_unit_types_company ON unit_types(company_id);

-- Units (Квартиры и помещения)
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  entrance_id UUID REFERENCES entrances(id) ON DELETE SET NULL,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id),
  number VARCHAR(50) NOT NULL,
  floor INT,
  area DECIMAL(10, 2) NOT NULL CHECK (area > 0),
  rooms INT,
  cadastral_number VARCHAR(100),
  owner_full_name VARCHAR(255),
  owner_phone VARCHAR(50),
  owner_email VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(building_id, number)
);

CREATE INDEX idx_units_condo ON units(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_building ON units(building_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_entrance ON units(entrance_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_type ON units(unit_type_id);
CREATE INDEX idx_units_is_active ON units(is_active) WHERE deleted_at IS NULL;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE,
  telegram_username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  locale VARCHAR(10) DEFAULT 'ru',
  is_active BOOLEAN DEFAULT true,
  is_2fa_enabled BOOLEAN DEFAULT false,
  gdpr_consent_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_telegram ON users(telegram_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_is_active ON users(is_active) WHERE deleted_at IS NULL;

-- Roles enum
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'super_accountant',
  'company_director',
  'company_accountant',
  'condo_admin',
  'condo_staff',
  'resident'
);

-- User Roles (многоконтекстность)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  staff_profile_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_context CHECK (
    (role IN ('super_admin', 'super_accountant') AND company_id IS NULL AND condo_id IS NULL) OR
    (role IN ('company_director', 'company_accountant') AND company_id IS NOT NULL AND condo_id IS NULL) OR
    (role IN ('condo_admin', 'condo_staff') AND condo_id IS NOT NULL) OR
    (role = 'resident')
  )
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_company ON user_roles(company_id);
CREATE INDEX idx_user_roles_condo ON user_roles(condo_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);
CREATE UNIQUE INDEX idx_user_roles_unique_super ON user_roles(user_id, role) 
  WHERE role IN ('super_admin', 'super_accountant');
CREATE UNIQUE INDEX idx_user_roles_unique_company ON user_roles(user_id, company_id, role) 
  WHERE role IN ('company_director', 'company_accountant');

-- Residents (Привязка жителей к объектам)
CREATE TABLE residents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  is_owner BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  moved_in_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  moved_out_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_residents_user ON residents(user_id);
CREATE INDEX idx_residents_unit ON residents(unit_id);
CREATE INDEX idx_residents_is_active ON residents(is_active);
CREATE UNIQUE INDEX idx_residents_active_unique ON residents(user_id, unit_id) 
  WHERE is_active = true;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_condos_updated_at BEFORE UPDATE ON condos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buildings_updated_at BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entrances_updated_at BEFORE UPDATE ON entrances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_residents_updated_at BEFORE UPDATE ON residents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
