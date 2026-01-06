-- Migration 004: Core Business Features
-- Meter readings, Invoices, Polls, Tickets, Vehicles, Documents
-- Created: 2026-01-06

-- ==========================================
-- METER READINGS (Показания счётчиков)
-- ==========================================

-- Meter types
CREATE TABLE meter_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL, -- m³, kWh, Gcal
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO meter_types (code, name, unit) VALUES
  ('cold_water', 'Холодная вода', 'm³'),
  ('hot_water', 'Горячая вода', 'm³'),
  ('electricity', 'Электричество', 'кВт⋅ч'),
  ('gas', 'Газ', 'm³'),
  ('heating', 'Отопление', 'Гкал');

-- Meters assigned to units
CREATE TABLE meters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  meter_type_id UUID NOT NULL REFERENCES meter_types(id),
  serial_number VARCHAR(100),
  installation_date DATE,
  last_verification_date DATE,
  next_verification_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_meters_unit ON meters(unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meters_type ON meters(meter_type_id);
CREATE INDEX idx_meters_active ON meters(is_active) WHERE deleted_at IS NULL;

-- Meter readings
CREATE TABLE meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_id UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  value DECIMAL(12, 3) NOT NULL CHECK (value >= 0),
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(50) DEFAULT 'manual', -- manual, telegram, ocr, api
  photo_url TEXT,
  ocr_confidence DECIMAL(3, 2),
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_meter_readings_meter ON meter_readings(meter_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_readings_date ON meter_readings(reading_date DESC);
CREATE INDEX idx_meter_readings_user ON meter_readings(user_id);
CREATE INDEX idx_meter_readings_verified ON meter_readings(is_verified);

-- ==========================================
-- INVOICES & PAYMENTS (Счета и платежи)
-- ==========================================

-- Invoice statuses
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status invoice_status DEFAULT 'draft',
  
  -- Amounts
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount DECIMAL(12, 2) DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
  paid_amount DECIMAL(12, 2) DEFAULT 0 CHECK (paid_amount >= 0),
  balance DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  
  currency VARCHAR(3) DEFAULT 'RUB',
  notes TEXT,
  
  -- Stripe
  stripe_invoice_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_unit ON invoices(unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_condo ON invoices(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status ON invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_period ON invoices(period_start, period_end);

-- Invoice line items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(12, 3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  meter_reading_id UUID REFERENCES meter_readings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Payment methods
CREATE TYPE payment_method AS ENUM ('card', 'bank_transfer', 'cash', 'stripe');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  payment_method payment_method NOT NULL,
  status payment_status DEFAULT 'pending',
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- External payment info
  stripe_payment_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  transaction_id VARCHAR(255),
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);

-- ==========================================
-- POLLS & VOTING (Голосования)
-- ==========================================

CREATE TYPE poll_status AS ENUM ('draft', 'active', 'closed', 'cancelled');
CREATE TYPE poll_type AS ENUM ('simple', 'general_meeting', 'board_decision');

-- Polls
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  poll_type poll_type DEFAULT 'simple',
  status poll_status DEFAULT 'draft',
  
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Quorum
  requires_quorum BOOLEAN DEFAULT false,
  quorum_percent DECIMAL(5, 2) CHECK (quorum_percent >= 0 AND quorum_percent <= 100),
  
  -- Voting settings
  allow_multiple_choices BOOLEAN DEFAULT false,
  allow_abstain BOOLEAN DEFAULT true,
  is_anonymous BOOLEAN DEFAULT false,
  
  -- Results
  total_eligible_voters INT DEFAULT 0,
  total_votes INT DEFAULT 0,
  quorum_reached BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CHECK (end_date > start_date)
);

CREATE INDEX idx_polls_condo ON polls(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_polls_status ON polls(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_polls_dates ON polls(start_date, end_date);

-- Poll options
CREATE TABLE poll_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_text VARCHAR(255) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  votes_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_poll_options_poll ON poll_options(poll_id);

-- Poll votes
CREATE TABLE poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id UUID REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  is_abstain BOOLEAN DEFAULT false,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(poll_id, user_id, unit_id)
);

CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_option ON poll_votes(option_id);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);

-- ==========================================
-- TICKETS (Заявки/Обращения)
-- ==========================================

CREATE TYPE ticket_status AS ENUM ('new', 'in_progress', 'waiting_resident', 'resolved', 'closed', 'cancelled');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Ticket categories
CREATE TABLE ticket_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ticket_categories (name, description, is_system, company_id) VALUES
  ('Ремонт', 'Ремонтные работы', true, NULL),
  ('Уборка', 'Уборка территории и подъездов', true, NULL),
  ('Отопление', 'Проблемы с отоплением', true, NULL),
  ('Водоснабжение', 'Проблемы с водоснабжением', true, NULL),
  ('Электричество', 'Проблемы с электричеством', true, NULL),
  ('Лифт', 'Неисправность лифта', true, NULL),
  ('Шум', 'Жалобы на шум', true, NULL),
  ('Другое', 'Прочие обращения', true, NULL);

CREATE INDEX idx_ticket_categories_company ON ticket_categories(company_id);

-- Tickets
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES ticket_categories(id),
  
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status ticket_status DEFAULT 'new',
  priority ticket_priority DEFAULT 'normal',
  
  -- SLA
  due_date TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tickets_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_unit ON tickets(unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_condo ON tickets(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_status ON tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_category ON tickets(category_id);

-- Ticket comments
CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ticket_comments_user ON ticket_comments(user_id);

-- ==========================================
-- VEHICLES (Автомобили)
-- ==========================================

CREATE TYPE vehicle_access_status AS ENUM ('active', 'suspended', 'expired');

-- Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  license_plate VARCHAR(20) NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100),
  color VARCHAR(50),
  
  access_status vehicle_access_status DEFAULT 'active',
  access_start_date DATE,
  access_end_date DATE,
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(license_plate, unit_id)
);

CREATE INDEX idx_vehicles_unit ON vehicles(unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicles_user ON vehicles(user_id);
CREATE INDEX idx_vehicles_plate ON vehicles(license_plate);
CREATE INDEX idx_vehicles_status ON vehicles(access_status);

-- ==========================================
-- DOCUMENTS (Документы)
-- ==========================================

CREATE TYPE document_type AS ENUM ('protocol', 'regulation', 'announcement', 'report', 'other');

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  document_type document_type NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_url TEXT NOT NULL,
  mime_type VARCHAR(100),
  
  is_public BOOLEAN DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_documents_condo ON documents(condo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_public ON documents(is_public) WHERE deleted_at IS NULL;

-- ==========================================
-- UPDATE TRIGGERS
-- ==========================================

CREATE TRIGGER update_meters_updated_at BEFORE UPDATE ON meters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meter_readings_updated_at BEFORE UPDATE ON meter_readings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_polls_updated_at BEFORE UPDATE ON polls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_comments_updated_at BEFORE UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
