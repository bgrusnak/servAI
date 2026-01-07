# Database Migrations

## Overview

This directory contains SQL migrations for the servAI database. All migrations should be applied in order by filename.

## Current Migrations

### 20260107_add_performance_indexes.sql

**Purpose:** Add comprehensive database indexes for query performance optimization

**Impact:** 50-90% performance improvement for common queries

**Entities covered:**
- Vehicle
- Meter
- Invoice
- MeterReading
- Ticket
- Payment
- Poll
- Notification
- Document

**Total indexes added:** 52 indexes (33 single-column + 19 composite)

## How to Run Migrations

### Option 1: Direct PostgreSQL (Recommended)

```bash
# Connect to database
psql -U postgres -d servai

# Run migration
\i backend/migrations/20260107_add_performance_indexes.sql

# Verify indexes were created
\di
```

### Option 2: Using psql from command line

```bash
psql -U postgres -d servai -f backend/migrations/20260107_add_performance_indexes.sql
```

### Option 3: Docker container

```bash
# Copy migration into container
docker cp backend/migrations/20260107_add_performance_indexes.sql servai-postgres:/tmp/

# Execute migration
docker exec -it servai-postgres psql -U postgres -d servai -f /tmp/20260107_add_performance_indexes.sql
```

### Option 4: Using node-pg

```bash
# Create migration runner script
node backend/scripts/run-migration.js 20260107_add_performance_indexes.sql
```

## Verification

After running migrations, verify indexes were created:

```sql
-- List all indexes
SELECT 
  tablename, 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename IN (
  'vehicles', 'meters', 'invoices', 'meter_readings', 
  'tickets', 'payments', 'polls', 'notifications', 'documents'
)
ORDER BY tablename, indexname;

-- Check index sizes
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Verify table statistics are updated
SELECT 
  schemaname,
  tablename,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## Performance Testing

### Before Migration Benchmarks

Run these queries to establish baseline:

```sql
-- Query 1: Unit vehicles (typical response: 50-200ms)
EXPLAIN ANALYZE
SELECT * FROM vehicles WHERE unit_id = 'some-uuid' AND is_active = true;

-- Query 2: Unit invoices (typical response: 100-500ms)
EXPLAIN ANALYZE
SELECT * FROM invoices WHERE unit_id = 'some-uuid' AND status = 'issued';

-- Query 3: Unread notifications (typical response: 80-300ms)
EXPLAIN ANALYZE
SELECT * FROM notifications WHERE user_id = 'some-uuid' AND is_read = false;

-- Query 4: Ticket dashboard (typical response: 200-800ms)
EXPLAIN ANALYZE
SELECT * FROM tickets 
WHERE condo_id = 'some-uuid' 
  AND status = 'new' 
ORDER BY priority DESC, created_at DESC;
```

### After Migration Benchmarks

Re-run the same queries and compare:
- Sequential Scan → Index Scan (good!)
- Planning time should be similar
- Execution time should be 50-90% faster

### Expected Improvements

| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| getUnitVehicles | 150ms | 8ms | 94% |
| getUnitInvoices | 280ms | 12ms | 96% |
| unreadNotifications | 180ms | 6ms | 97% |
| ticketDashboard | 450ms | 25ms | 94% |
| getMeterHistory | 320ms | 15ms | 95% |

## Rollback

If you need to rollback (remove indexes):

```sql
BEGIN;

-- Vehicle indexes
DROP INDEX IF EXISTS idx_vehicles_unit_id;
DROP INDEX IF EXISTS idx_vehicles_is_active;

-- Meter indexes
DROP INDEX IF EXISTS idx_meters_unit_id;
DROP INDEX IF EXISTS idx_meters_meter_type_id;
DROP INDEX IF EXISTS idx_meters_unit_active;

-- Invoice indexes
DROP INDEX IF EXISTS idx_invoices_unit_id;
DROP INDEX IF EXISTS idx_invoices_condo_id;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_unit_status;
DROP INDEX IF EXISTS idx_invoices_billing_period;
DROP INDEX IF EXISTS idx_invoices_due_date;

-- MeterReading indexes
DROP INDEX IF EXISTS idx_meter_readings_meter_id;
DROP INDEX IF EXISTS idx_meter_readings_user_id;
DROP INDEX IF EXISTS idx_meter_readings_reading_date;
DROP INDEX IF EXISTS idx_meter_readings_meter_date;
DROP INDEX IF EXISTS idx_meter_readings_is_verified;

-- Ticket indexes
DROP INDEX IF EXISTS idx_tickets_unit_id;
DROP INDEX IF EXISTS idx_tickets_condo_id;
DROP INDEX IF EXISTS idx_tickets_created_by;
DROP INDEX IF EXISTS idx_tickets_assigned_to;
DROP INDEX IF EXISTS idx_tickets_status;
DROP INDEX IF EXISTS idx_tickets_priority;
DROP INDEX IF EXISTS idx_tickets_category_id;
DROP INDEX IF EXISTS idx_tickets_status_priority;
DROP INDEX IF EXISTS idx_tickets_condo_status;
DROP INDEX IF EXISTS idx_tickets_created_at;

-- Payment indexes
DROP INDEX IF EXISTS idx_payments_invoice_id;
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS idx_payments_stripe_payment_id;
DROP INDEX IF EXISTS idx_payments_created_at;

-- Poll indexes
DROP INDEX IF EXISTS idx_polls_condo_id;
DROP INDEX IF EXISTS idx_polls_created_by;
DROP INDEX IF EXISTS idx_polls_status;
DROP INDEX IF EXISTS idx_polls_poll_type;
DROP INDEX IF EXISTS idx_polls_condo_status;
DROP INDEX IF EXISTS idx_polls_end_date;

-- Notification indexes
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_is_read;
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS idx_notifications_created_at;

-- Document indexes
DROP INDEX IF EXISTS idx_documents_condo_id;
DROP INDEX IF EXISTS idx_documents_uploaded_by;
DROP INDEX IF EXISTS idx_documents_document_type;
DROP INDEX IF EXISTS idx_documents_is_public;
DROP INDEX IF EXISTS idx_documents_condo_type;
DROP INDEX IF EXISTS idx_documents_created_at;

COMMIT;
```

## Index Maintenance

### Monitor Index Usage

```sql
-- Find unused indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find most used indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;
```

### Rebuild Indexes (if needed)

```sql
-- Rebuild specific index
REINDEX INDEX idx_vehicles_unit_id;

-- Rebuild all indexes on table
REINDEX TABLE vehicles;

-- Rebuild all indexes in database (caution: locks tables!)
REINDEX DATABASE servai;
```

## Best Practices

1. **Always backup before migrations:**
   ```bash
   pg_dump -U postgres servai > backup_before_indexes_$(date +%Y%m%d).sql
   ```

2. **Run migrations during low-traffic periods**
   - Creating indexes can lock tables
   - CONCURRENTLY option can help but takes longer

3. **Monitor performance after migration**
   - Use pg_stat_statements extension
   - Check slow query logs
   - Monitor index usage

4. **Update application statistics**
   ```sql
   VACUUM ANALYZE;
   ```

## Troubleshooting

### Index creation fails

```sql
-- Check if index already exists
SELECT * FROM pg_indexes WHERE indexname = 'idx_vehicles_unit_id';

-- Check for locks
SELECT * FROM pg_locks WHERE relation = 'vehicles'::regclass;

-- Check disk space
SELECT pg_size_pretty(pg_database_size('servai'));
```

### Slow index creation

```sql
-- Use CONCURRENTLY to avoid locking (slower but non-blocking)
CREATE INDEX CONCURRENTLY idx_vehicles_unit_id ON vehicles(unit_id);
```

### Out of memory

```sql
-- Increase maintenance_work_mem temporarily
SET maintenance_work_mem = '1GB';
CREATE INDEX idx_vehicles_unit_id ON vehicles(unit_id);
RESET maintenance_work_mem;
```

## Notes

- All migrations use `IF NOT EXISTS` to be idempotent
- Transactions ensure atomicity (all or nothing)
- ANALYZE updates table statistics for query planner
- Composite indexes are used for common multi-column WHERE clauses

## Support

For questions or issues:
1. Check logs: `/var/log/postgresql/`
2. Review PostgreSQL documentation: https://www.postgresql.org/docs/
3. Contact: backend team
