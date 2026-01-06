# servAI Production Deployment Guide 🚀

**Version:** 1.0  
**Last Updated:** January 6, 2026  
**Status:** Production Ready ✅  

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Database Setup](#database-setup)
4. [Application Deployment](#application-deployment)
5. [Monitoring Setup](#monitoring-setup)
6. [Security Checklist](#security-checklist)
7. [Post-Deployment](#post-deployment)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services

- **PostgreSQL** 14+ (managed or self-hosted)
- **Redis** 6+ (for rate limiting)
- **Node.js** 18+ LTS
- **Email Provider** (SendGrid, Mailgun, or AWS SES)
- **Domain** with SSL certificate
- **Monitoring** (Prometheus + Grafana recommended)

### Required Tools

```bash
# Local machine
- Docker 20+
- kubectl (if using Kubernetes)
- psql (PostgreSQL client)
- redis-cli
```

---

## Infrastructure Setup

### Option 1: Traditional VPS (DigitalOcean, AWS EC2, etc.)

#### Minimum Specs

**Production (Small - up to 10K users):**
- 2 vCPUs
- 4 GB RAM
- 50 GB SSD
- Ubuntu 22.04 LTS

**Production (Medium - up to 100K users):**
- 4 vCPUs
- 8 GB RAM
- 100 GB SSD
- Load balancer recommended

#### Server Setup

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install PostgreSQL 14
sudo apt install postgresql postgresql-contrib -y

# 4. Install Redis
sudo apt install redis-server -y

# 5. Install Nginx (reverse proxy)
sudo apt install nginx -y

# 6. Install certbot (SSL certificates)
sudo apt install certbot python3-certbot-nginx -y

# 7. Install PM2 (process manager)
sudo npm install -g pm2

# 8. Create app user
sudo useradd -m -s /bin/bash servai
sudo usermod -aG sudo servai
```

---

### Option 2: Docker Compose

#### `docker-compose.yml`

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:14-alpine
    container_name: servai-db
    restart: always
    environment:
      POSTGRES_DB: servai
      POSTGRES_USER: servai
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/src/db/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U servai"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: servai-redis
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # Backend API
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: servai-api
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://servai:${DB_PASSWORD}@postgres:5432/servai
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      EMAIL_API_KEY: ${EMAIL_API_KEY}
      EMAIL_API_URL: ${EMAIL_API_URL}
      EMAIL_FROM: ${EMAIL_FROM}
      APP_URL: ${APP_URL}
      CORS_ORIGIN: ${CORS_ORIGIN}
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: servai-nginx
    restart: always
    depends_on:
      - api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    container_name: servai-prometheus
    restart: always
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  # Grafana Dashboards
  grafana:
    image: grafana/grafana:latest
    container_name: servai-grafana
    restart: always
    depends_on:
      - prometheus
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
  nginx_logs:
```

#### `.env.production`

```bash
# Database
DB_PASSWORD=your_secure_db_password_here
DATABASE_URL=postgresql://servai:${DB_PASSWORD}@postgres:5432/servai

# Redis
REDIS_URL=redis://redis:6379
REDIS_KEY_PREFIX=servai:

# JWT
JWT_SECRET=your_super_secret_64_character_minimum_jwt_secret_key_here_change_this
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email (SendGrid example)
EMAIL_API_URL=https://api.sendgrid.com/v3
EMAIL_API_KEY=SG.your_sendgrid_api_key_here
EMAIL_FROM=noreply@servai.app
EMAIL_FROM_NAME=servAI

# Application
APP_URL=https://servai.app
NODE_ENV=production
PORT=3000

# CORS
CORS_ORIGIN=https://app.servai.app,https://servai.app

# Monitoring
GRAFANA_PASSWORD=your_grafana_admin_password
```

#### Deploy with Docker Compose

```bash
# 1. Clone repository
git clone https://github.com/yourusername/servAI.git
cd servAI

# 2. Copy and edit environment file
cp .env.example .env.production
nano .env.production  # Edit with your values

# 3. Build and start services
docker-compose --env-file .env.production up -d

# 4. Check logs
docker-compose logs -f api

# 5. Run migrations
docker-compose exec api npm run migrate

# 6. Verify health
curl http://localhost:3000/health
```

---

### Option 3: Kubernetes

#### Kubernetes Manifests

See `k8s/` directory for complete manifests:

```bash
k8s/
├── namespace.yaml
├── configmap.yaml
├── secrets.yaml
├── postgres-statefulset.yaml
├── redis-deployment.yaml
├── api-deployment.yaml
├── api-service.yaml
├── ingress.yaml
└── hpa.yaml
```

#### Deploy to Kubernetes

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create secrets
kubectl create secret generic servai-secrets \
  --from-literal=jwt-secret='your-jwt-secret' \
  --from-literal=db-password='your-db-password' \
  --from-literal=email-api-key='your-email-key' \
  -n servai

# 3. Apply all manifests
kubectl apply -f k8s/

# 4. Check deployment
kubectl get pods -n servai
kubectl logs -f deployment/servai-api -n servai

# 5. Port forward to test
kubectl port-forward svc/servai-api 3000:3000 -n servai
curl http://localhost:3000/health
```

---

## Database Setup

### PostgreSQL Configuration

#### Create Database and User

```sql
-- Connect as postgres user
psql -U postgres

-- Create database
CREATE DATABASE servai;

-- Create user
CREATE USER servai WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE servai TO servai;

-- Connect to servai database
\c servai

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO servai;
```

#### Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://servai:password@localhost:5432/servai"

# Run migrations
cd backend
npm run migrate

# Verify tables
psql $DATABASE_URL -c "\dt"
```

#### Production Tuning

```conf
# /etc/postgresql/14/main/postgresql.conf

# Memory settings (for 8GB RAM server)
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 16MB

# Connection settings
max_connections = 200

# Write-ahead log
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query planning
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging
log_min_duration_statement = 1000  # Log queries > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
```

#### Backup Strategy

```bash
# Daily backup script
#!/bin/bash
# /opt/scripts/backup-db.sh

BACKUP_DIR="/backups/servai"
DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/servai_$DATE.sql.gz"

# Create backup
pg_dump -U servai servai | gzip > "$FILE"

# Keep only last 7 days
find "$BACKUP_DIR" -name "servai_*.sql.gz" -mtime +7 -delete

# Upload to S3 (optional)
aws s3 cp "$FILE" s3://servai-backups/database/

echo "Backup completed: $FILE"
```

```bash
# Add to crontab
0 2 * * * /opt/scripts/backup-db.sh >> /var/log/servai-backup.log 2>&1
```

---

## Application Deployment

### Build Application

```bash
# 1. Install dependencies
cd backend
npm ci --production

# 2. Build TypeScript
npm run build

# 3. Verify build
ls -la dist/
```

### PM2 Deployment (Traditional VPS)

#### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'servai-api',
    script: './dist/server.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_file: '.env.production',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
    watch: false,
  }, {
    name: 'servai-worker',
    script: './dist/worker.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env.production',
    autorestart: true,
    cron_restart: '0 3 * * *',  // Restart daily at 3 AM
  }]
};
```

#### Deploy with PM2

```bash
# 1. Start application
pm2 start ecosystem.config.js --env production

# 2. Save PM2 configuration
pm2 save

# 3. Setup PM2 startup script
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u servai --hp /home/servai

# 4. Monitor
pm2 monit

# 5. Check logs
pm2 logs servai-api
```

---

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'servai-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
      
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

### Grafana Dashboards

**Import these dashboard IDs:**
- **Node Exporter Full:** 1860
- **PostgreSQL Database:** 9628
- **Redis Dashboard:** 11835

**Custom servAI Dashboard:**

See `monitoring/grafana-dashboard.json` for pre-configured dashboard.

### Alert Rules

```yaml
# alerts.yml
groups:
  - name: servai
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"
      
      # High response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time"
          description: "P95 latency is {{ $value }}s"
      
      # Database down
      - alert: DatabaseDown
        expr: up{job="postgres-exporter"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down"
      
      # High memory usage
      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes > 1e9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage: {{ $value | humanize }}B"
```

---

## Security Checklist

### Pre-Deployment

- [ ] **JWT_SECRET** is 64+ random characters
- [ ] **Database password** is strong and unique
- [ ] **CORS_ORIGIN** is set to specific domains (not `*`)
- [ ] **SSL/TLS** certificates are installed
- [ ] **Firewall** rules configured (only ports 80, 443, 22 open)
- [ ] **Database** not exposed to internet
- [ ] **Redis** not exposed to internet
- [ ] **Environment variables** not in source control
- [ ] **Rate limiting** enabled
- [ ] **Helmet** middleware active

### Post-Deployment

- [ ] Test all authentication flows
- [ ] Verify rate limiting works
- [ ] Check error logging (no sensitive data)
- [ ] Review metrics endpoint (restrict access)
- [ ] Test SSL certificate
- [ ] Verify database backups
- [ ] Check monitoring alerts
- [ ] Review server logs

### Security Headers

Verify with:

```bash
curl -I https://api.servai.app/health
```

Should include:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

---

## Post-Deployment

### Health Check

```bash
# Basic health
curl https://api.servai.app/health

# Detailed health
curl https://api.servai.app/health | jq .

# Metrics
curl https://api.servai.app/metrics
```

### Smoke Tests

```bash
# Run automated smoke tests
cd backend/loadtests
export API_BASE_URL=https://api.servai.app
k6 run smoke-test.js
```

### Monitor for 24 Hours

1. **Watch error rates** (should be <0.1%)
2. **Monitor response times** (p95 <500ms)
3. **Check memory usage** (should be stable)
4. **Review logs** (no critical errors)
5. **Verify alerts** (test alert delivery)

---

## Rollback Procedures

### Quick Rollback (Docker)

```bash
# 1. Stop current deployment
docker-compose down

# 2. Checkout previous version
git checkout <previous-tag>

# 3. Rebuild and restart
docker-compose up -d --build

# 4. Verify
curl http://localhost:3000/health
```

### Database Rollback

```bash
# 1. Stop application
pm2 stop servai-api

# 2. Restore from backup
gunzip < /backups/servai/servai_20260106_020000.sql.gz | psql -U servai servai

# 3. Restart application
pm2 start servai-api
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs servai-api --lines 100

# Check environment
env | grep -E "DATABASE_URL|REDIS_URL|JWT_SECRET"

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Test Redis connection
redis-cli -u $REDIS_URL ping
```

### High Response Times

```bash
# Check database queries
psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check connection pool
curl http://localhost:3000/health | jq .checks.database

# Check Redis
redis-cli --stat
```

### Memory Leaks

```bash
# Monitor memory over time
watch -n 5 'ps aux | grep node'

# Heap snapshot
node --inspect dist/server.js
# Open chrome://inspect
```

### Database Connection Issues

```bash
# Check connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection limits
psql $DATABASE_URL -c "SHOW max_connections;"

# Kill idle connections
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';"
```

---

## Support

For issues or questions:
- **GitHub Issues:** https://github.com/yourusername/servAI/issues
- **Documentation:** https://github.com/yourusername/servAI/wiki
- **Email:** support@servai.app

---

**Deployment completed! \ud83c\udf89**

Remember to:
1. Monitor for 24-48 hours
2. Set up automated backups
3. Configure alerts
4. Document any custom configuration
5. Schedule load testing
