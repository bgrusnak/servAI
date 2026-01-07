#!/bin/bash

# Setup script for test database
# This script creates and configures the test database for running tests

set -e

echo "Setting up test database for servAI..."

# Load environment variables
if [ -f .env.test ]; then
    source .env.test
else
    echo "Warning: .env.test not found, using defaults"
fi

# Default values
DB_USER=${TEST_DB_USER:-servai_test}
DB_PASSWORD=${TEST_DB_PASSWORD:-servai_test}
DB_NAME=${TEST_DB_NAME:-servai_test}
DB_HOST=${TEST_DB_HOST:-localhost}
DB_PORT=${TEST_DB_PORT:-5432}

echo "Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo "Error: PostgreSQL is not running on $DB_HOST:$DB_PORT"
    echo "Please start PostgreSQL and try again."
    exit 1
fi

echo "PostgreSQL is running ✓"

# Check if database exists
if psql -h $DB_HOST -p $DB_PORT -U postgres -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "Database $DB_NAME already exists"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping database $DB_NAME..."
        psql -h $DB_HOST -p $DB_PORT -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    else
        echo "Keeping existing database"
        exit 0
    fi
fi

# Create database
echo "Creating database $DB_NAME..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "CREATE DATABASE $DB_NAME;"

# Create user if not exists
echo "Creating user $DB_USER..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User already exists"

# Grant privileges
echo "Granting privileges..."
psql -h $DB_HOST -p $DB_PORT -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
psql -h $DB_HOST -p $DB_PORT -U postgres -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

echo ""
echo "Test database setup complete! ✓"
echo ""
echo "You can now run tests with:"
echo "  npm test"
echo ""
echo "Or with coverage:"
echo "  npm run test:coverage"
echo ""
