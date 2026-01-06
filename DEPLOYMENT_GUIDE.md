# servAI - Production Deployment Guide 🚀

**Version:** 1.0  
**Last Updated:** January 6, 2026  
**Target Environment:** Production  
**Estimated Time:** 2-4 hours  

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Application Deployment](#application-deployment)
6. [Monitoring Setup](#monitoring-setup)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Rollback Procedure](#rollback-procedure)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist ✅

### Infrastructure Requirements

- [ ] **Server:** 4 CPU, 8GB RAM minimum
- [ ] **Database:** PostgreSQL 14+ (managed service recommended)
- [ ] **Cache:** Redis 7+ (managed service recommended)
- [ ] **Node.js:** v18+ LTS
- [ ] **Domain:** SSL/TLS certificate configured
- [ ] **Email:** SendGrid/Mailgun account with API key
- [ ] **Monitoring:** Prometheus + Grafana setup
- [ ] **Backups:** Automated daily backups configured

### Security Requirements

- [ ] **JWT_SECRET:** Generated (64+ characters)
- [ ] **Database password:** Strong (32+ characters)
- [ ] **Redis password:** Strong (32+ characters)
- [ ] **API keys:** Rotated from development
- [ ] **CORS:** Production domains configured
- [ ] **Firewall:** Only necessary ports open
- [ ] **SSH:** Key-based authentication only

### Documentation

- [ ] Environment variables documented
- [ ] Runbook reviewed by team
- [ ] Incident response plan ready
- [ ] Monitoring alerts configured
- [ ] On-call rotation scheduled

---

## Infrastructure Setup 🏗️

### Option 1: Cloud Provider (Recommended)

#### AWS Setup

```bash
# 1. EC2 Instance (Application)
t3.medium (2 vCPU, 4GB) or t3.large (2 vCPU, 8GB)
OS: Ubuntu 22.04 LTS
Storage: 50GB SSD

# 2. RDS PostgreSQL (Database)
db.t3.medium (2 vCPU, 4GB)
PostgreSQL 14.10
Storage: 100GB SSD
Backups: Automated daily, 7-day retention
Multi-AZ: Yes (for production)

# 3. ElastiCache Redis (Cache)
cache.t3.micro (1 vCPU, 0.5GB)
Redis 7.0
Backup: Daily snapshots

# 4. Application Load Balancer
HTTPS termination
Health checks configured
SSL certificate from ACM

# 5. CloudWatch (Monitoring)
Log groups created
Alerts configured
```

#### DigitalOcean Setup

```bash
# 1. Droplet (Application)
Size: 4GB RAM, 2 vCPUs ($24/month)
OS: Ubuntu 22.04 LTS
Storage: 80GB SSD

# 2. Managed PostgreSQL
Size: 2GB RAM, 1 vCPU ($15/month)
PostgreSQL 14
Daily backups included

# 3. Managed Redis
Size: 1GB RAM ($15/month)
Redis 7

# 4. Load Balancer
HTTPS enabled
Let's Encrypt SSL
```

### Option 2: VPS Setup

```bash
# Single server setup (for small deployments)
Server: 8GB RAM, 4 vCPUs
PostgreSQL: Installed locally
Redis: Installed locally
Nginx: Reverse proxy with SSL
```

---

## Environment Configuration ⚙️

### 1. Generate Secrets

```bash
# Generate JWT secret (64+ characters)
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
echo "JWT_SECRET=$JWT_SECRET"

# Generate database password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
echo "DB_PASSWORD=$DB_PASSWORD"

# Generate Redis password
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
```

### 2. Create .env File

```bash
# Create production .env
cat > .env.production << 'EOF'
# Environment
NODE_ENV=production
PORT=3000

# Database (Replace with your values)
DATABASE_URL=postgresql://servai:YOUR_DB_PASSWORD@your-db-host:5432/servai_production

# Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@your-redis-host:6379
REDIS_KEY_PREFIX=servai:prod:

# JWT (Use generated secret)
JWT_SECRET=YOUR_64_CHAR_JWT_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email (SendGrid example)
EMAIL_API_URL=https://api.sendgrid.com/v3
EMAIL_API_KEY=YOUR_SENDGRID_API_KEY
EMAIL_FROM=noreply@servai.app
EMAIL_FROM_NAME=servAI

# Application
APP_URL=https://servai.app
CORS_ORIGIN=https://app.servai.app,https://admin.servai.app

# Logging
LOG_LEVEL=info

# Monitoring
METRICS_ENABLED=true
EOF
```

### 3. Validate Configuration

```bash
# Check all required variables are set
node -e "
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'EMAIL_API_KEY',
  'APP_URL',
  'CORS_ORIGIN'
];

required.forEach(key => {
  if (!process.env[key]) {
    console.error('Missing:', key);
    process.exit(1);
  }
});

console.log('✅ All environment variables configured');
"
```

---

## Database Setup 🗄️

### 1. Create Production Database

```sql
-- Connect to PostgreSQL as admin
psql -h your-db-host -U postgres

-- Create database and user
CREATE DATABASE servai_production;
CREATE USER servai WITH PASSWORD 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE servai_production TO servai;

-- Enable extensions
\c servai_production
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO servai;
```

### 2. Run Migrations

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT version();"

# Run migrations
npm run migrate

# Verify migrations
psql "$DATABASE_URL" -c "
  SELECT version, name, applied_at 
  FROM schema_migrations 
  ORDER BY version;
"
```

### 3. Create Initial Admin User

```bash
# Option 1: Use seed script
node scripts/create-admin.js

# Option 2: Manual SQL
psql "$DATABASE_URL" << 'EOF'
INSERT INTO users (email, password_hash, first_name, last_name, email_verified)
VALUES (
  'admin@servai.app',
  '$2b$10$HASH_FROM_BCRYPT', -- Generate with: node -e "console.log(require('bcrypt').hashSync('YOUR_PASSWORD', 10))"
  'Admin',
  'User',
  true
);
EOF
```

### 4. Configure Backups

```bash
# AWS RDS: Automated backups enabled by default
# DigitalOcean: Included in managed database

# Manual backup script (for VPS)
cat > /opt/servai/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/servai/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/servai_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"
pg_dump "$DATABASE_URL" | gzip > "$FILE"

# Keep last 7 days
find "$BACKUP_DIR" -name "servai_*.sql.gz" -mtime +7 -delete

echo "Backup created: $FILE"
EOF

chmod +x /opt/servai/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /opt/servai/backup.sh >> /var/log/servai-backup.log 2>&1
```

---

## Application Deployment 🚀

### 1. Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /opt/servai
sudo chown $USER:$USER /opt/servai
cd /opt/servai
```

### 2. Deploy Application

```bash
# Clone repository (or upload built files)
git clone https://github.com/your-org/servai.git .
cd backend

# Install dependencies (production only)
npm ci --production

# Build TypeScript
npm run build

# Copy environment file
cp .env.production .env

# Test build
node dist/server.js &
PID=$!
sleep 3
curl http://localhost:3000/health
kill $PID
```

### 3. Configure PM2

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'servai-api',
      script: 'dist/server.js',
      instances: 2, // Cluster mode
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/servai/error.log',
      out_file: '/var/log/servai/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'servai-worker',
      script: 'dist/worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

# Create log directory
sudo mkdir -p /var/log/servai
sudo chown $USER:$USER /var/log/servai

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Run the command it outputs
```

### 4. Configure Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx config
sudo cat > /etc/nginx/sites-available/servai << 'EOF'
upstream servai_backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001; # If using PM2 cluster
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name api.servai.app;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.servai.app;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.servai.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.servai.app/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req zone=api_limit burst=20 nodelay;

    # Client max body size
    client_max_body_size 1M;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Proxy to Node.js
    location / {
        proxy_pass http://servai_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check (no rate limit)
    location /health {
        proxy_pass http://servai_backend/health;
        access_log off;
    }

    # Metrics (restrict to internal IPs)
    location /metrics {
        allow 10.0.0.0/8;     # Private network
        allow 172.16.0.0/12;  # Private network
        allow 192.168.0.0/16; # Private network
        deny all;
        proxy_pass http://servai_backend/metrics;
    }

    # Access logs
    access_log /var/log/nginx/servai-access.log;
    error_log /var/log/nginx/servai-error.log;
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/servai /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 5. Setup SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.servai.app

# Test renewal
sudo certbot renew --dry-run

# Auto-renewal is configured via cron by default
```

---

## Monitoring Setup 📊

### 1. Prometheus Setup

```yaml
# /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'servai-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scheme: http
```

### 2. Grafana Dashboard

```bash
# Import dashboard ID: 1860 (Node.js Application Dashboard)
# Or create custom dashboard with:
# - HTTP request rate
# - HTTP error rate
# - HTTP request duration (p50, p95, p99)
# - Database query duration
# - Memory usage
# - CPU usage
```

### 3. Alert Rules

```yaml
# /etc/prometheus/rules/servai.yml
groups:
  - name: servai
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up{job="servai-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "servAI API is down"
          description: "API has been down for 1 minute"

      - alert: HighMemoryUsage
        expr: process_rss_bytes / 1024 / 1024 > 1024
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}MB"
```

### 4. Log Aggregation

```bash
# Option 1: ELK Stack
# Option 2: Loki + Grafana
# Option 3: CloudWatch Logs (AWS)

# Configure Winston to send to log aggregator
# Add to src/utils/logger.ts:
transports: [
  new winston.transports.File({ filename: '/var/log/servai/app.log' }),
  // Add transport for your log aggregator
]
```

---

## Post-Deployment Verification ✅

### 1. Health Checks

```bash
# Basic health check
curl https://api.servai.app/health
# Expected: {"status":"ok",...}

# Liveness probe
curl https://api.servai.app/health/liveness
# Expected: {"status":"ok"}

# Readiness probe
curl https://api.servai.app/health/readiness
# Expected: {"status":"ready"}
```

### 2. API Tests

```bash
# Test registration
curl -X POST https://api.servai.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "first_name": "Test",
    "last_name": "User"
  }'

# Test login
curl -X POST https://api.servai.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Test authenticated endpoint
TOKEN="your_access_token"
curl https://api.servai.app/api/v1/companies \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Performance Test

```bash
# Install Apache Bench
sudo apt install -y apache2-utils

# Simple load test (100 requests, 10 concurrent)
ab -n 100 -c 10 https://api.servai.app/health

# Expected: 
# - Requests per second: > 500
# - Time per request: < 20ms
# - Failed requests: 0
```

### 4. Monitoring Verification

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check metrics endpoint
curl http://localhost:3000/metrics

# Verify Grafana dashboards
open http://your-grafana-url:3000
```

---

## Rollback Procedure 🔄

### Quick Rollback

```bash
# 1. Stop current version
pm2 stop all

# 2. Switch to previous version
cd /opt/servai
git checkout <previous-version-tag>
cd backend
npm ci --production
npm run build

# 3. Rollback database if needed
psql "$DATABASE_URL" < backups/pre-deployment-backup.sql

# 4. Restart services
pm2 restart all

# 5. Verify
curl https://api.servai.app/health
```

### Database Rollback

```bash
# List available backups
ls -lh /opt/servai/backups/

# Restore from backup
psql "$DATABASE_URL" < /opt/servai/backups/servai_20260106_120000.sql
```

---

## Troubleshooting 🔧

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs servai-api --lines 100

# Check for port conflicts
sudo lsof -i :3000

# Check environment variables
pm2 env 0

# Test manually
cd /opt/servai/backend
node dist/server.js
```

### Database Connection Issues

```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Verify connection pool
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"
```

### High Memory Usage

```bash
# Check process memory
pm2 monit

# Node.js heap dump
kill -USR2 <pid>

# Restart if needed
pm2 restart servai-api
```

### Slow Response Times

```bash
# Check database slow queries
psql "$DATABASE_URL" << 'EOF'
SELECT 
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
EOF

# Check Redis latency
redis-cli --latency

# Check Nginx access log
tail -f /var/log/nginx/servai-access.log
```

---

## Production Maintenance 🛠️

### Daily Tasks

- [ ] Monitor error rates in Grafana
- [ ] Check application logs for anomalies
- [ ] Verify backup completion

### Weekly Tasks

- [ ] Review security alerts
- [ ] Check disk space usage
- [ ] Review slow query log
- [ ] Update dependencies (security patches)

### Monthly Tasks

- [ ] Security audit
- [ ] Performance review
- [ ] Backup restoration test
- [ ] Capacity planning review

---

## Support Contacts 📞

**On-Call Engineer:** +X-XXX-XXX-XXXX  
**DevOps Lead:** devops@servai.app  
**Security Team:** security@servai.app  
**Emergency Hotline:** +X-XXX-XXX-XXXX

**Documentation:** https://docs.servai.app  
**Status Page:** https://status.servai.app  
**Incident Dashboard:** https://grafana.servai.app

---

**Deployment Guide Version:** 1.0  
**Last Updated:** January 6, 2026  
**Next Review:** February 6, 2026
