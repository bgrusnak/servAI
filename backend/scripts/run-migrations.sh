#!/bin/bash

# =====================================================
# servAI Migration Runner
# Usage: ./scripts/run-migrations.sh [migration-file]
# =====================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-servai}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
MIGRATIONS_DIR="backend/migrations"

echo -e "${GREEN}servAI Database Migration Runner${NC}"
echo "======================================"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed${NC}"
    echo "Install PostgreSQL client: sudo apt-get install postgresql-client"
    exit 1
fi

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}Error: Migrations directory not found: $MIGRATIONS_DIR${NC}"
    exit 1
fi

# Function to run a single migration
run_migration() {
    local migration_file=$1
    echo -e "${YELLOW}Running migration: $migration_file${NC}"
    
    if [ ! -f "$migration_file" ]; then
        echo -e "${RED}Error: Migration file not found: $migration_file${NC}"
        exit 1
    fi
    
    # Run migration
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file"; then
        echo -e "${GREEN}✓ Migration completed successfully${NC}"
        echo ""
    else
        echo -e "${RED}✗ Migration failed${NC}"
        exit 1
    fi
}

# Function to verify migration
verify_migration() {
    echo -e "${YELLOW}Verifying indexes...${NC}"
    
    local verify_query="
    SELECT COUNT(*) as index_count
    FROM pg_indexes 
    WHERE tablename IN ('vehicles', 'meters', 'invoices', 'meter_readings', 'tickets', 'payments', 'polls', 'notifications', 'documents')
    AND indexname LIKE 'idx_%';
    "
    
    local count=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "$verify_query" | xargs)
    
    echo "Indexes created: $count"
    
    if [ "$count" -ge 50 ]; then
        echo -e "${GREEN}✓ Verification successful${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Expected ~52 indexes, found $count${NC}"
    fi
    echo ""
}

# Main execution
if [ $# -eq 0 ]; then
    # Run all migrations in order
    echo "Running all migrations..."
    echo ""
    
    for migration in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration" ]; then
            run_migration "$migration"
        fi
    done
    
    verify_migration
else
    # Run specific migration
    migration_file="$MIGRATIONS_DIR/$1"
    run_migration "$migration_file"
    verify_migration
fi

echo -e "${GREEN}All migrations completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Run VACUUM ANALYZE to update statistics"
echo "2. Monitor query performance"
echo "3. Check index usage: SELECT * FROM pg_stat_user_indexes;"
echo ""
