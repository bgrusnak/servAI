-- =====================================================
-- servAI COMPLETE DATABASE SCHEMA
-- Version: 1.0.0
-- Date: 2026-01-07
-- Description: Full database schema - ALL tables, indexes, constraints
-- =====================================================
-- This file contains EVERYTHING needed to create the entire database
-- from scratch. It replaces all separate migrations.
-- =====================================================

BEGIN;

-- =====================================================
-- EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- =====================================================
-- ENUMS
-- =====================================================

-- User related
CREATE TYPE user_role_enum AS ENUM ('super_admin', 'admin', 'manager', 'resident', 'guest');
CREATE TYPE user_status_enum AS ENUM ('active', 'inactive', 'suspended');

-- Invoice related
CREATE TYPE invoice_status_enum AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');

-- Payment related
CREATE TYPE payment_status_enum AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Ticket related
CREATE TYPE ticket_status_enum AS ENUM ('new', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');

-- Poll related
CREATE TYPE poll_type_enum AS ENUM ('simple', 'meeting', 'budget');
CREATE TYPE poll_status_enum AS ENUM ('draft', 'active', 'closed');

-- Notification related
CREATE TYPE notification_type_enum AS ENUM ('info', 'warning', 'error', 'success');

-- Meter related
CREATE TYPE reading_source_enum AS ENUM ('manual', 'ocr', 'auto');

-- Vehicle access
CREATE TYPE access_type_enum AS ENUM ('entry', 'exit');

-- Audit log
CREATE TYPE audit_action_enum AS ENUM ('create', 'update', 'delete', 'login', 'logout');

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Companies (multi-tenancy)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Condos (buildings complexes)
CREATE TABLE IF NOT EXISTS condos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Russia',
    total_units INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Buildings (within condos)
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    floors INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Entrances (within buildings)
CREATE TABLE IF NOT EXISTS entrances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    number VARCHAR(50) NOT NULL,
    floors INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Units (apartments)
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    entrance_id UUID REFERENCES entrances(id) ON DELETE SET NULL,
    unit_number VARCHAR(50) NOT NULL,
    floor INTEGER,
    area DECIMAL(10, 2),
    rooms INTEGER,
    owner_name VARCHAR(255),
    owner_phone VARCHAR(50),
    owner_email VARCHAR(255),
    is_occupied BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(condo_id, unit_number)
);

-- =====================================================
-- USER MANAGEMENT
-- =====================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    telegram_id BIGINT UNIQUE,
    telegram_username VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Roles (many-to-many: user can have multiple roles in different condos)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL DEFAULT 'resident',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Residents (additional info for unit residents)
CREATE TABLE IF NOT EXISTS residents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    is_owner BOOLEAN DEFAULT false,
    move_in_date DATE,
    move_out_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- BILLING & PAYMENTS
-- =====================================================

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    invoice_number VARCHAR(255) UNIQUE NOT NULL,
    billing_period DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    status invoice_status_enum DEFAULT 'draft',
    stripe_payment_intent_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status payment_status_enum DEFAULT 'pending',
    stripe_payment_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- UTILITIES & METERS
-- =====================================================

-- Meter Types
CREATE TABLE IF NOT EXISTS meter_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    unit_of_measurement VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meters
CREATE TABLE IF NOT EXISTS meters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    meter_type_id UUID NOT NULL REFERENCES meter_types(id) ON DELETE RESTRICT,
    serial_number VARCHAR(255) UNIQUE NOT NULL,
    installation_date DATE,
    last_reading_date DATE,
    last_reading_value DECIMAL(10, 3),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meter Readings
CREATE TABLE IF NOT EXISTS meter_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value DECIMAL(10, 3) NOT NULL,
    reading_date DATE NOT NULL,
    source reading_source_enum DEFAULT 'manual',
    photo_url TEXT,
    ocr_confidence DECIMAL(5, 2),
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TICKETS & SUPPORT
-- =====================================================

-- Ticket Categories
CREATE TABLE IF NOT EXISTS ticket_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES ticket_categories(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ticket_status_enum DEFAULT 'new',
    priority ticket_priority_enum DEFAULT 'medium',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket Comments
CREATE TABLE IF NOT EXISTS ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- POLLS & VOTING
-- =====================================================

-- Polls
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    poll_type poll_type_enum DEFAULT 'simple',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status poll_status_enum DEFAULT 'draft',
    requires_quorum BOOLEAN DEFAULT false,
    quorum_percent DECIMAL(5, 2),
    allow_multiple_choices BOOLEAN DEFAULT false,
    allow_abstain BOOLEAN DEFAULT true,
    is_anonymous BOOLEAN DEFAULT false,
    total_votes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Poll Options
CREATE TABLE IF NOT EXISTS poll_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_text VARCHAR(255) NOT NULL,
    vote_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Poll Votes
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    weight DECIMAL(5, 2) DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, user_id, option_id)
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type notification_type_enum DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    action_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- DOCUMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- VEHICLES
-- =====================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    license_plate VARCHAR(50) NOT NULL UNIQUE,
    make VARCHAR(100),
    model VARCHAR(100),
    color VARCHAR(50),
    year INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    license_plate VARCHAR(50) NOT NULL,
    access_type access_type_enum NOT NULL,
    gate_location VARCHAR(255),
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TELEGRAM INTEGRATION
-- =====================================================

CREATE TABLE IF NOT EXISTS telegram_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    chat_id BIGINT NOT NULL,
    message_id INTEGER NOT NULL,
    message_text TEXT,
    message_type VARCHAR(50),
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
);

-- =====================================================
-- AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action audit_action_enum NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Companies
CREATE INDEX idx_companies_is_active ON companies(is_active);

-- Condos
CREATE INDEX idx_condos_company_id ON condos(company_id);

-- Buildings
CREATE INDEX idx_buildings_condo_id ON buildings(condo_id);

-- Entrances
CREATE INDEX idx_entrances_building_id ON entrances(building_id);

-- Units
CREATE INDEX idx_units_condo_id ON units(condo_id);
CREATE INDEX idx_units_entrance_id ON units(entrance_id);
CREATE INDEX idx_units_is_occupied ON units(is_occupied);

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_is_active ON users(is_active);

-- User Roles
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_condo_id ON user_roles(condo_id);
CREATE INDEX idx_user_roles_unit_id ON user_roles(unit_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Residents
CREATE INDEX idx_residents_user_id ON residents(user_id);
CREATE INDEX idx_residents_unit_id ON residents(unit_id);

-- Refresh Tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Invites
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_used ON invites(used);

-- Vehicles (from optimization)
CREATE INDEX idx_vehicles_unit_id ON vehicles(unit_id);
CREATE INDEX idx_vehicles_is_active ON vehicles(is_active);
CREATE INDEX idx_vehicles_license_plate ON vehicles(license_plate);

-- Vehicle Access Logs
CREATE INDEX idx_vehicle_access_logs_vehicle_id ON vehicle_access_logs(vehicle_id);
CREATE INDEX idx_vehicle_access_logs_license_plate ON vehicle_access_logs(license_plate);
CREATE INDEX idx_vehicle_access_logs_created_at ON vehicle_access_logs(created_at);

-- Meters (from optimization)
CREATE INDEX idx_meters_unit_id ON meters(unit_id);
CREATE INDEX idx_meters_meter_type_id ON meters(meter_type_id);
CREATE INDEX idx_meters_unit_active ON meters(unit_id, is_active);
CREATE INDEX idx_meters_serial_number ON meters(serial_number);

-- Meter Readings (from optimization)
CREATE INDEX idx_meter_readings_meter_id ON meter_readings(meter_id);
CREATE INDEX idx_meter_readings_user_id ON meter_readings(user_id);
CREATE INDEX idx_meter_readings_reading_date ON meter_readings(reading_date);
CREATE INDEX idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date);
CREATE INDEX idx_meter_readings_is_verified ON meter_readings(is_verified);

-- Invoices (from optimization)
CREATE INDEX idx_invoices_unit_id ON invoices(unit_id);
CREATE INDEX idx_invoices_condo_id ON invoices(condo_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_unit_status ON invoices(unit_id, status);
CREATE INDEX idx_invoices_billing_period ON invoices(billing_period);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);

-- Invoice Items
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Payments (from optimization)
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_payment_id ON payments(stripe_payment_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Tickets (from optimization)
CREATE INDEX idx_tickets_unit_id ON tickets(unit_id);
CREATE INDEX idx_tickets_condo_id ON tickets(condo_id);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_category_id ON tickets(category_id);
CREATE INDEX idx_tickets_status_priority ON tickets(status, priority);
CREATE INDEX idx_tickets_condo_status ON tickets(condo_id, status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- Ticket Comments
CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_user_id ON ticket_comments(user_id);

-- Polls (from optimization)
CREATE INDEX idx_polls_condo_id ON polls(condo_id);
CREATE INDEX idx_polls_created_by ON polls(created_by);
CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_polls_poll_type ON polls(poll_type);
CREATE INDEX idx_polls_condo_status ON polls(condo_id, status);
CREATE INDEX idx_polls_end_date ON polls(end_date);

-- Poll Options
CREATE INDEX idx_poll_options_poll_id ON poll_options(poll_id);

-- Poll Votes
CREATE INDEX idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_option_id ON poll_votes(option_id);
CREATE INDEX idx_poll_votes_user_id ON poll_votes(user_id);
CREATE INDEX idx_poll_votes_unit_id ON poll_votes(unit_id);

-- Notifications (from optimization)
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Documents (from optimization)
CREATE INDEX idx_documents_condo_id ON documents(condo_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_is_public ON documents(is_public);
CREATE INDEX idx_documents_condo_type ON documents(condo_id, document_type);
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- Telegram Messages
CREATE INDEX idx_telegram_messages_user_id ON telegram_messages(user_id);
CREATE INDEX idx_telegram_messages_chat_id ON telegram_messages(chat_id);
CREATE INDEX idx_telegram_messages_is_processed ON telegram_messages(is_processed);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =====================================================
-- FULL TEXT SEARCH INDEXES
-- =====================================================

CREATE INDEX idx_tickets_title_gin ON tickets USING gin(to_tsvector('russian', title));
CREATE INDEX idx_tickets_description_gin ON tickets USING gin(to_tsvector('russian', description));
CREATE INDEX idx_documents_title_gin ON documents USING gin(to_tsvector('russian', title));

-- =====================================================
-- UPDATE STATISTICS
-- =====================================================

ANALYZE companies;
ANALYZE condos;
ANALYZE buildings;
ANALYZE entrances;
ANALYZE units;
ANALYZE users;
ANALYZE user_roles;
ANALYZE residents;
ANALYZE refresh_tokens;
ANALYZE invites;
ANALYZE vehicles;
ANALYZE vehicle_access_logs;
ANALYZE meter_types;
ANALYZE meters;
ANALYZE meter_readings;
ANALYZE invoices;
ANALYZE invoice_items;
ANALYZE payments;
ANALYZE ticket_categories;
ANALYZE tickets;
ANALYZE ticket_comments;
ANALYZE polls;
ANALYZE poll_options;
ANALYZE poll_votes;
ANALYZE notifications;
ANALYZE documents;
ANALYZE telegram_messages;
ANALYZE audit_logs;

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run after migration to verify:
-- 
-- SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
-- Expected: 27 tables
--
-- SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
-- Expected: 100+ indexes
--
-- SELECT typname FROM pg_type WHERE typtype = 'e';
-- Expected: 11 enums
-- =====================================================
