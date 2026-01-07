-- =====================================================
-- servAI Performance Indexes Migration
-- Created: 2026-01-07
-- Description: Add comprehensive indexes for all entities
-- Estimated impact: 50-90% query performance improvement
-- =====================================================

-- Start transaction
BEGIN;

-- =====================================================
-- VEHICLE INDEXES
-- =====================================================
-- Improves: getUnitVehicles(), checkVehicleAccess()
CREATE INDEX IF NOT EXISTS idx_vehicles_unit_id ON vehicles(unit_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active);

-- =====================================================
-- METER INDEXES
-- =====================================================
-- Improves: getUnitMeters(), filterByType()
CREATE INDEX IF NOT EXISTS idx_meters_unit_id ON meters(unit_id);
CREATE INDEX IF NOT EXISTS idx_meters_meter_type_id ON meters(meter_type_id);
CREATE INDEX IF NOT EXISTS idx_meters_unit_active ON meters(unit_id, is_active);

-- =====================================================
-- INVOICE INDEXES
-- =====================================================
-- Improves: getUnitInvoices(), condoInvoices(), overdueCheck(), billingReports()
CREATE INDEX IF NOT EXISTS idx_invoices_unit_id ON invoices(unit_id);
CREATE INDEX IF NOT EXISTS idx_invoices_condo_id ON invoices(condo_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_unit_status ON invoices(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON invoices(billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- =====================================================
-- METER READING INDEXES
-- =====================================================
-- Improves: getMeterHistory(), verificationQueue(), dateRangeQueries()
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_id ON meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_user_id ON meter_readings(user_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_reading_date ON meter_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_meter_readings_meter_date ON meter_readings(meter_id, reading_date);
CREATE INDEX IF NOT EXISTS idx_meter_readings_is_verified ON meter_readings(is_verified);

-- =====================================================
-- TICKET INDEXES
-- =====================================================
-- Improves: getUnitTickets(), condoTickets(), assignedTickets(), ticketDashboard()
CREATE INDEX IF NOT EXISTS idx_tickets_unit_id ON tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_tickets_condo_id ON tickets(condo_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_condo_status ON tickets(condo_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

-- =====================================================
-- PAYMENT INDEXES
-- =====================================================
-- Improves: getInvoicePayments(), paymentHistory(), stripeWebhooks()
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- =====================================================
-- POLL INDEXES
-- =====================================================
-- Improves: getCondoPolls(), activePolls(), pollsByType(), expirationCheck()
CREATE INDEX IF NOT EXISTS idx_polls_condo_id ON polls(condo_id);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_poll_type ON polls(poll_type);
CREATE INDEX IF NOT EXISTS idx_polls_condo_status ON polls(condo_id, status);
CREATE INDEX IF NOT EXISTS idx_polls_end_date ON polls(end_date);

-- =====================================================
-- NOTIFICATION INDEXES
-- =====================================================
-- Improves: getUserNotifications(), unreadCount(), markAsRead()
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- =====================================================
-- DOCUMENT INDEXES
-- =====================================================
-- Improves: getCondoDocuments(), filterByType(), userDocuments(), publicDocuments()
CREATE INDEX IF NOT EXISTS idx_documents_condo_id ON documents(condo_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_is_public ON documents(is_public);
CREATE INDEX IF NOT EXISTS idx_documents_condo_type ON documents(condo_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- =====================================================
-- ANALYZE TABLES
-- =====================================================
-- Update PostgreSQL statistics for query planner
ANALYZE vehicles;
ANALYZE meters;
ANALYZE invoices;
ANALYZE meter_readings;
ANALYZE tickets;
ANALYZE payments;
ANALYZE polls;
ANALYZE notifications;
ANALYZE documents;

-- Commit transaction
COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify indexes were created:

-- List all indexes
-- SELECT tablename, indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('vehicles', 'meters', 'invoices', 'meter_readings', 'tickets', 'payments', 'polls', 'notifications', 'documents')
-- ORDER BY tablename, indexname;

-- Check index sizes
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY pg_relation_size(indexrelid) DESC;
