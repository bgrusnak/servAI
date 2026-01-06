-- Migration 002: Invites, Meter Types, Meter Readings, Tickets, Notifications, Audit Logs
-- Created: 2026-01-06

-- Invites (for residents registration)
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  max_uses INT,
  current_uses INT DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invites_unit ON invites(unit_id) WHERE is_active = true;
CREATE INDEX idx_invites_token ON invites(token) WHERE is_active = true;
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE is_active = true;

CREATE TRIGGER update_invites_updated_at BEFORE UPDATE ON invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Meter Types (Типы счётчиков)
CREATE TABLE meter_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  unit VARCHAR(20) DEFAULT 'кВт*ч',
  is_multi_tariff BOOLEAN DEFAULT false,
  tariff_names TEXT[],
  is_system BOOLEAN DEFAULT false,
  validation_min DECIMAL(12, 4) DEFAULT 0,
  validation_max DECIMAL(12, 4),
  max_monthly_increase DECIMAL(12, 4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_meter_type_context CHECK (
    (is_system = true AND company_id IS NULL AND condo_id IS NULL) OR
    (is_system = false AND (company_id IS NOT NULL OR condo_id IS NOT NULL))
  )
);

-- System meter types
INSERT INTO meter_types (name, code, unit, is_multi_tariff, tariff_names, is_system) VALUES
  ('Холодная вода', 'cold_water', 'м³', false, NULL, true),
  ('Горячая вода', 'hot_water', 'м³', false, NULL, true),
  ('Электричество', 'electricity', 'кВт*ч', false, NULL, true),
  ('Электричество (день/ночь)', 'electricity_day_night', 'кВт*ч', true, ARRAY['День', 'Ночь'], true),
  ('Газ', 'gas', 'м³', false, NULL, true);

CREATE INDEX idx_meter_types_company ON meter_types(company_id);
CREATE INDEX idx_meter_types_condo ON meter_types(condo_id);
CREATE INDEX idx_meter_types_code ON meter_types(code);

CREATE TRIGGER update_meter_types_updated_at BEFORE UPDATE ON meter_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Meter Readings (Показания счётчиков)
CREATE TABLE meter_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  meter_type_id UUID NOT NULL REFERENCES meter_types(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  value DECIMAL(12, 4) NOT NULL CHECK (value > 0),
  tariff_values JSONB,
  photo_url TEXT,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_validated BOOLEAN DEFAULT false,
  is_forced BOOLEAN DEFAULT false,
  validation_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_meter_readings_unit ON meter_readings(unit_id, reading_date DESC);
CREATE INDEX idx_meter_readings_resident ON meter_readings(resident_id);
CREATE INDEX idx_meter_readings_date ON meter_readings(reading_date DESC);
CREATE INDEX idx_meter_readings_meter_type ON meter_readings(meter_type_id);

-- Ticket Categories (Категории обращений)
CREATE TABLE ticket_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(20),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_category_context CHECK (
    (is_system = true AND company_id IS NULL AND condo_id IS NULL) OR
    (is_system = false AND (company_id IS NOT NULL OR condo_id IS NOT NULL))
  )
);

-- System categories
INSERT INTO ticket_categories (name, code, icon, color, is_system) VALUES
  ('Сантехника', 'plumbing', 'droplet', 'blue', true),
  ('Электрика', 'electrical', 'flash', 'yellow', true),
  ('Отопление', 'heating', 'flame', 'red', true),
  ('Уборка', 'cleaning', 'broom', 'green', true),
  ('Охрана', 'security', 'shield', 'gray', true),
  ('Прочее', 'other', 'help-circle', 'purple', true);

CREATE INDEX idx_ticket_categories_company ON ticket_categories(company_id);
CREATE INDEX idx_ticket_categories_condo ON ticket_categories(condo_id);

-- Ticket Status enum
CREATE TYPE ticket_status AS ENUM (
  'new',
  'assigned',
  'in_progress',
  'review',
  'resolved',
  'closed',
  'cancelled'
);

-- Tickets (Обращения)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number SERIAL UNIQUE,
  condo_id UUID NOT NULL REFERENCES condos(id),
  unit_id UUID NOT NULL REFERENCES units(id),
  category_id UUID NOT NULL REFERENCES ticket_categories(id),
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  status ticket_status DEFAULT 'new',
  priority INT DEFAULT 0,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  photos TEXT[],
  rating INT CHECK (rating >= 1 AND rating <= 5),
  rated_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_condo ON tickets(condo_id, status, created_at DESC);
CREATE INDEX idx_tickets_unit ON tickets(unit_id, created_at DESC);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tickets_status ON tickets(status, created_at DESC);
CREATE INDEX idx_tickets_number ON tickets(number);

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ticket Comments
CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  photos TEXT[],
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);
CREATE INDEX idx_ticket_comments_user ON ticket_comments(user_id);

CREATE TRIGGER update_ticket_comments_updated_at BEFORE UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ticket Status History
CREATE TABLE ticket_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_status ticket_status,
  to_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_status_history_ticket ON ticket_status_history(ticket_id, created_at);

-- Notifications
CREATE TYPE notification_type AS ENUM (
  'ticket_assigned',
  'ticket_status_changed',
  'ticket_comment',
  'meter_reminder',
  'payment_due',
  'payment_received',
  'invoice_ready',
  'system'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_sent ON notifications(sent_at) WHERE sent_at IS NOT NULL;

-- Telegram Messages (dialog history)
CREATE TABLE telegram_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  telegram_message_id BIGINT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type VARCHAR(20) NOT NULL,
  text TEXT,
  data JSONB,
  intent VARCHAR(100),
  intent_params JSONB,
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_telegram_messages_user ON telegram_messages(user_id, created_at DESC);
CREATE INDEX idx_telegram_messages_telegram_id ON telegram_messages(telegram_message_id);
CREATE INDEX idx_telegram_messages_unprocessed ON telegram_messages(created_at) 
  WHERE direction = 'incoming' AND processed_at IS NULL;

-- User Context Summary (for AI)
CREATE TABLE user_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_summaries_user ON user_summaries(user_id);

CREATE TRIGGER update_user_summaries_updated_at BEFORE UPDATE ON user_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  path TEXT NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);
CREATE INDEX idx_files_created ON files(created_at);
