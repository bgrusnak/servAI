-- Migration 001: Complete database schema with soft delete everywhere
-- Created: 2026-01-06
-- All tables have soft delete (deleted_at) from the start

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE ENTITIES
-- ============================================================================

-- Companies (УК - управляющие компании)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  inn VARCHAR(12) UNIQUE,
  kpp VARCHAR(9),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_companies_inn ON companies(inn) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_active ON companies(is_active) WHERE deleted_at IS NULL;

-- Condos (ЖК - жилые комплексы)
CREATE TABLE condos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  total_buildings INTEGER,
  total_units INTEGER,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_condos_company ON condos(company_id) WHERE deleted_at IS NULL;

-- Buildings (Корпуса)
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  address TEXT,
  floors INTEGER,
  units_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(condo_id, number)
);

CREATE INDEX idx_buildings_condo ON buildings(condo_id) WHERE deleted_at IS NULL;

-- Entrances (Подъезды)
CREATE TABLE entrances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  floors INTEGER,
  units_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(building_id, number)
);

CREATE INDEX idx_entrances_building ON entrances(building_id) WHERE deleted_at IS NULL;

-- Unit Types (Типы помещений: квартира, кладовка, паркинг)
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- System unit types
INSERT INTO unit_types (code, name, is_system) VALUES
  ('apartment', 'Квартира', true),
  ('storage', 'Кладовка', true),
  ('parking', 'Парковочное место', true),
  ('commercial', 'Коммерческое помещение', true);

-- Units (Помещения)
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  entrance_id UUID REFERENCES entrances(id) ON DELETE SET NULL,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id),
  number VARCHAR(50) NOT NULL,
  floor INTEGER,
  area_total DECIMAL(10,2),
  area_living DECIMAL(10,2),
  rooms INTEGER,
  owner_name VARCHAR(255),
  owner_phone VARCHAR(20),
  owner_email VARCHAR(255),
  is_rented BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_units_condo ON units(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_building ON units(building_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_entrance ON units(entrance_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_type ON units(unit_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_number ON units(condo_id, number) WHERE deleted_at IS NULL;

-- ============================================================================
-- USERS & AUTH
-- ============================================================================

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  telegram_id BIGINT UNIQUE,
  telegram_username VARCHAR(255),
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_telegram ON users(telegram_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- User Roles (multi-context: может быть админом УК и жителем в другом ЖК)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  granted_by UUID REFERENCES users(id),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_roles_company ON user_roles(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_roles_condo ON user_roles(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_roles_active ON user_roles(user_id, is_active) WHERE deleted_at IS NULL;

-- Refresh Tokens (for JWT rotation)
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

-- Residents (связь пользователь-помещение)
CREATE TABLE residents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  is_owner BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  moved_in_at TIMESTAMP WITH TIME ZONE,
  moved_out_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_residents_user ON residents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_residents_unit ON residents(unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_residents_active ON residents(user_id, is_active) WHERE deleted_at IS NULL AND is_active = true;

-- ============================================================================
-- INVITES
-- ============================================================================

CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(20),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_invites_unit ON invites(unit_id) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_invites_token ON invites(token) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_invites_created_by ON invites(created_by) WHERE deleted_at IS NULL;

-- ============================================================================
-- METERS & READINGS
-- ============================================================================

-- Meter Types (Типы счетчиков)
CREATE TABLE meter_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  is_multi_tariff BOOLEAN DEFAULT false,
  tariff_count INTEGER DEFAULT 1,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(company_id, condo_id, code)
);

CREATE INDEX idx_meter_types_company ON meter_types(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_types_condo ON meter_types(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_types_lookup ON meter_types(company_id, condo_id, code) WHERE deleted_at IS NULL AND is_system = false;

-- System meter types
INSERT INTO meter_types (code, name, unit, is_system) VALUES
  ('cold_water', 'Холодная вода', 'м³', true),
  ('hot_water', 'Горячая вода', 'м³', true),
  ('electricity', 'Электроэнергия', 'кВт⋅ч', true),
  ('electricity_day_night', 'Электроэнергия (день/ночь)', 'кВт⋅ч', true),
  ('gas', 'Газ', 'м³', true),
  ('heating', 'Отопление', 'Гкал', true);

-- Meter Readings
CREATE TABLE meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  meter_type_id UUID NOT NULL REFERENCES meter_types(id),
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  value DECIMAL(10,3) NOT NULL,
  tariff_values JSONB,
  photos JSONB,
  notes TEXT,
  submitted_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_meter_readings_unit ON meter_readings(unit_id, reading_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_readings_meter_type_fk ON meter_readings(meter_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_readings_recent ON meter_readings(unit_id, meter_type_id, reading_date DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- TICKETS (Обращения)
-- ============================================================================

-- Ticket Categories
CREATE TABLE ticket_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(company_id, condo_id, code)
);

CREATE INDEX idx_ticket_categories_lookup ON ticket_categories(company_id, condo_id, code) WHERE deleted_at IS NULL AND is_system = false;

-- System ticket categories
INSERT INTO ticket_categories (code, name, is_system) VALUES
  ('repair', 'Ремонт', true),
  ('plumbing', 'Сантехника', true),
  ('electricity', 'Электрика', true),
  ('heating', 'Отопление', true),
  ('cleaning', 'Уборка', true),
  ('other', 'Прочее', true);

-- Tickets
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  category_id UUID REFERENCES ticket_categories(id),
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'new',
  priority VARCHAR(50) DEFAULT 'medium',
  photos JSONB,
  resolved_at TIMESTAMP WITH TIME ZONE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  rating_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tickets_condo ON tickets(condo_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_unit ON tickets(unit_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_status ON tickets(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_category_fk ON tickets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_created_by ON tickets(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to) WHERE deleted_at IS NULL;

-- Ticket Comments
CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  photos JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_ticket_comments_user_fk ON ticket_comments(user_id) WHERE deleted_at IS NULL;

-- Ticket Status History
CREATE TABLE ticket_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  comment TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ticket_status_history_ticket ON ticket_status_history(ticket_id, changed_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_ticket_status_history_user_fk ON ticket_status_history(changed_by) WHERE deleted_at IS NULL;

-- ============================================================================
-- NOTIFICATIONS & MESSAGES
-- ============================================================================

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notifications_user_fk ON notifications(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notifications_type ON notifications(type, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE deleted_at IS NULL AND is_read = false;

-- Telegram Messages (история диалогов)
CREATE TABLE telegram_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_message_id BIGINT,
  direction VARCHAR(10) NOT NULL,
  text TEXT,
  intent VARCHAR(100),
  intent_params JSONB,
  response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_telegram_messages_user ON telegram_messages(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_telegram_messages_user_fk ON telegram_messages(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_telegram_messages_intent ON telegram_messages(intent) WHERE deleted_at IS NULL AND intent IS NOT NULL;
CREATE INDEX idx_telegram_messages_chat ON telegram_messages(telegram_chat_id, created_at DESC) WHERE deleted_at IS NULL;

-- User Summaries (контекст для AI)
CREATE TABLE user_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);

CREATE INDEX idx_user_summaries_user ON user_summaries(user_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- AUDIT & FILES
-- ============================================================================

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC) WHERE deleted_at IS NULL;

-- Files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_files_entity ON files(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_user_fk ON files(uploaded_by) WHERE deleted_at IS NULL;

-- ============================================================================
-- ACTIVE VIEWS (for soft delete queries)
-- ============================================================================

CREATE VIEW companies_active AS SELECT * FROM companies WHERE deleted_at IS NULL;
CREATE VIEW condos_active AS SELECT * FROM condos WHERE deleted_at IS NULL;
CREATE VIEW buildings_active AS SELECT * FROM buildings WHERE deleted_at IS NULL;
CREATE VIEW entrances_active AS SELECT * FROM entrances WHERE deleted_at IS NULL;
CREATE VIEW units_active AS SELECT * FROM units WHERE deleted_at IS NULL;
CREATE VIEW users_active AS SELECT * FROM users WHERE deleted_at IS NULL;
CREATE VIEW user_roles_active AS SELECT * FROM user_roles WHERE deleted_at IS NULL;
CREATE VIEW residents_active AS SELECT * FROM residents WHERE deleted_at IS NULL;
CREATE VIEW invites_active AS SELECT * FROM invites WHERE deleted_at IS NULL;
CREATE VIEW meter_types_active AS SELECT * FROM meter_types WHERE deleted_at IS NULL;
CREATE VIEW meter_readings_active AS SELECT * FROM meter_readings WHERE deleted_at IS NULL;
CREATE VIEW ticket_categories_active AS SELECT * FROM ticket_categories WHERE deleted_at IS NULL;
CREATE VIEW tickets_active AS SELECT * FROM tickets WHERE deleted_at IS NULL;
CREATE VIEW ticket_comments_active AS SELECT * FROM ticket_comments WHERE deleted_at IS NULL;
CREATE VIEW notifications_active AS SELECT * FROM notifications WHERE deleted_at IS NULL;
CREATE VIEW telegram_messages_active AS SELECT * FROM telegram_messages WHERE deleted_at IS NULL;
CREATE VIEW files_active AS SELECT * FROM files WHERE deleted_at IS NULL;
CREATE VIEW refresh_tokens_active AS SELECT * FROM refresh_tokens WHERE deleted_at IS NULL AND revoked_at IS NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
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

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_summaries_updated_at BEFORE UPDATE ON user_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
