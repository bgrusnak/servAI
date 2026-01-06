# servAI - Production Runbook 📖

**Purpose:** Quick reference guide for common operational tasks and incident response.  
**Audience:** DevOps, SRE, On-call engineers  
**Last Updated:** January 6, 2026

---

## Table of Contents

1. [Service Overview](#service-overview)
2. [Common Tasks](#common-tasks)
3. [Incident Response](#incident-response)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Database Operations](#database-operations)
7. [Emergency Procedures](#emergency-procedures)

---

## Service Overview 🎯

### Architecture

```
┌─────────────┐
│   Nginx     │ :443 (HTTPS)
│ Load Balancer│
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Node.js    │────▶│ PostgreSQL   │
│  (PM2 x2)   │     │   Database   │
│   :3000     │     └──────────────┘
└──────┬──────┘            
       │
       ▼
┌─────────────┐
│   Redis     │
│   Cache     │
└─────────────┘
```

### Key Components

| Component | Port | Purpose | Health Check |
|-----------|------|---------|-------------|
| Nginx | 443 | Reverse proxy | `systemctl status nginx` |
| Node.js API | 3000 | Application server | `curl localhost:3000/health` |
| PostgreSQL | 5432 | Database | `psql -c "SELECT 1;"` |
| Redis | 6379 | Cache/Rate limiting | `redis-cli ping` |
| Prometheus | 9090 | Metrics | `curl localhost:9090/-/healthy` |
| Grafana | 3001 | Dashboards | `curl localhost:3001/api/health` |

### Important Files & Directories

```bash
/opt/servai/              # Application root
/opt/servai/backend/      # Backend code
/var/log/servai/          # Application logs
/var/log/nginx/           # Nginx logs
/opt/servai/backups/      # Database backups
/etc/nginx/sites-enabled/ # Nginx config
/etc/systemd/system/      # Service configs
```

---

## Common Tasks 🔧

### Restart Application

```bash
# Restart API server
pm2 restart servai-api

# Restart worker
pm2 restart servai-worker

# Restart all
pm2 restart all

# Restart with zero-downtime (cluster mode)
pm2 reload servai-api
```

### View Logs

```bash
# Real-time application logs
pm2 logs servai-api --lines 100

# Error logs only
pm2 logs servai-api --err

# Nginx access logs
sudo tail -f /var/log/nginx/servai-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/servai-error.log

# Application file logs
tail -f /var/log/servai/app.log | jq
```

### Check Service Status

```bash
# PM2 status
pm2 status

# Detailed monitoring
pm2 monit

# Process list
pm2 list

# System services
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis
```

### Deploy New Version

```bash
# 1. Backup current version
cd /opt/servai
git tag backup-$(date +%Y%m%d-%H%M%S)

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
cd backend
npm ci --production

# 4. Build
npm run build

# 5. Run migrations
npm run migrate

# 6. Reload with zero-downtime
pm2 reload ecosystem.config.js --env production

# 7. Verify
curl https://api.servai.app/health
```

### Database Backup

```bash
# Manual backup
pg_dump "$DATABASE_URL" | gzip > "/opt/servai/backups/manual-$(date +%Y%m%d-%H%M%S).sql.gz"

# List backups
ls -lh /opt/servai/backups/

# Restore from backup
gunzip < /opt/servai/backups/backup.sql.gz | psql "$DATABASE_URL"
```

### Clear Redis Cache

```bash
# Flush all keys (CAUTION!)
redis-cli FLUSHALL

# Flush only servai keys
redis-cli --scan --pattern "servai:*" | xargs redis-cli DEL

# Check Redis memory usage
redis-cli INFO memory
```

---

## Incident Response 🚨

### Incident Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **SEV-1** | Service down | Immediate | CTO + Team |
| **SEV-2** | Degraded service | 15 minutes | On-call engineer |
| **SEV-3** | Minor issues | 1 hour | During business hours |
| **SEV-4** | Informational | Next sprint | No escalation |

### Incident Response Workflow

```
1. ACKNOWLEDGE
   └─▶ Update status page
   └─▶ Notify team in Slack

2. ASSESS
   └─▶ Check health endpoints
   └─▶ Review logs
   └─▶ Check metrics

3. MITIGATE
   └─▶ Apply immediate fix
   └─▶ Or rollback if needed

4. RESOLVE
   └─▶ Verify fix
   └─▶ Update status page

5. POST-MORTEM
   └─▶ Document incident
   └─▶ Action items
```

### Communication Template

```markdown
**INCIDENT ALERT**

Severity: SEV-X
Status: INVESTIGATING / IDENTIFIED / MONITORING / RESOLVED
Start Time: YYYY-MM-DD HH:MM UTC

**Impact:**
- What is affected
- How many users
- Since when

**Current Actions:**
- What we're doing
- ETA for resolution

**Next Update:** In X minutes

**Incident Commander:** @username
```

---

## Troubleshooting Guide 🔍

### Service is Down (SEV-1)

**Symptoms:**
- Health check returns 503
- Users cannot access API
- Alerts: ServiceDown

**Diagnosis:**

```bash
# 1. Check if process is running
pm2 list

# 2. Check ports
sudo lsof -i :3000

# 3. Check recent logs
pm2 logs servai-api --lines 50 --err

# 4. Check system resources
free -h
df -h
top
```

**Resolution:**

```bash
# Quick fix: Restart
pm2 restart servai-api

# If still down: Check configuration
node -e "require('./dist/config').config"

# If config error: Fix .env and restart
vim .env
pm2 restart servai-api

# Last resort: Rollback
git checkout <previous-tag>
npm run build
pm2 restart all
```

---

### High Error Rate (SEV-2)

**Symptoms:**
- Alert: HighErrorRate
- 500 errors in logs
- Error rate > 5%

**Diagnosis:**

```bash
# 1. Check error logs
pm2 logs servai-api --err --lines 100

# 2. Check error patterns
grep "ERROR" /var/log/servai/app.log | tail -50

# 3. Check database connection
psql "$DATABASE_URL" -c "SELECT 1;"

# 4. Check Redis
redis-cli ping
```

**Common Causes:**

1. **Database Connection Pool Exhausted**
   ```bash
   # Check active connections
   psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"
   
   # Increase pool size in config if needed
   # Or restart to reset connections
   pm2 restart servai-api
   ```

2. **Redis Connection Lost**
   ```bash
   # Check Redis
   redis-cli ping
   
   # Restart Redis if needed
   sudo systemctl restart redis
   
   # App should use fallback, but restart to reset
   pm2 restart servai-api
   ```

3. **Memory Leak**
   ```bash
   # Check memory usage
   pm2 monit
   
   # If > 1GB per process, restart
   pm2 restart servai-api
   
   # Investigate with heap dump
   kill -USR2 <pid>
   ```

---

### High Latency (SEV-2)

**Symptoms:**
- Alert: HighLatency
- P95 > 1 second
- Slow user experience

**Diagnosis:**

```bash
# 1. Check database slow queries
psql "$DATABASE_URL" << 'EOF'
SELECT 
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;
EOF

# 2. Check Redis latency
redis-cli --latency-history

# 3. Check system load
uptime
top
iostat
```

**Resolution:**

1. **Slow Database Queries**
   ```sql
   -- Add missing indexes
   CREATE INDEX CONCURRENTLY idx_name ON table_name (column);
   
   -- Or kill long-running queries
   SELECT pg_cancel_backend(pid) FROM pg_stat_activity 
   WHERE state = 'active' AND query_start < now() - interval '5 minutes';
   ```

2. **High CPU/Memory**
   ```bash
   # Scale up instances
   pm2 scale servai-api +2
   
   # Or upgrade server resources
   ```

---

### Database Connection Issues (SEV-1)

**Symptoms:**
- "connection refused" errors
- "too many clients" errors
- Database timeout

**Diagnosis:**

```bash
# 1. Check PostgreSQL is running
sudo systemctl status postgresql

# 2. Test connection
psql "$DATABASE_URL" -c "SELECT version();"

# 3. Check active connections
psql "$DATABASE_URL" << 'EOF'
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity;
EOF

# 4. Check max connections
psql "$DATABASE_URL" -c "SHOW max_connections;"
```

**Resolution:**

```bash
# If PostgreSQL is down
sudo systemctl start postgresql

# If too many connections, kill idle ones
psql "$DATABASE_URL" << 'EOF'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < now() - interval '10 minutes';
EOF

# Restart app to reset pool
pm2 restart servai-api

# If persistent, increase max_connections
# /etc/postgresql/14/main/postgresql.conf
# max_connections = 200
sudo systemctl restart postgresql
```

---

### Disk Space Full (SEV-2)

**Symptoms:**
- "No space left on device" errors
- Application crashes
- Cannot write logs

**Diagnosis:**

```bash
# Check disk usage
df -h

# Find large files
sudo du -sh /* | sort -hr | head -10

# Check log sizes
du -sh /var/log/servai/*
du -sh /var/log/nginx/*
```

**Resolution:**

```bash
# 1. Clear old logs
sudo find /var/log/servai -name "*.log" -mtime +7 -delete
sudo find /var/log/nginx -name "*.log.*.gz" -mtime +7 -delete

# 2. Clear old backups
sudo find /opt/servai/backups -name "*.sql.gz" -mtime +7 -delete

# 3. Clear package manager cache
sudo apt clean
npm cache clean --force

# 4. Rotate logs
sudo logrotate -f /etc/logrotate.conf

# 5. If database is large, vacuum
psql "$DATABASE_URL" -c "VACUUM FULL;"
```

---

## Monitoring & Alerts 📊

### Key Metrics to Watch

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Error Rate | > 2% | > 5% | Check logs, rollback |
| P95 Latency | > 500ms | > 1s | Check slow queries |
| Memory Usage | > 80% | > 90% | Restart, scale up |
| CPU Usage | > 70% | > 90% | Scale up |
| Disk Usage | > 80% | > 90% | Clean up logs |
| DB Connections | > 80 | > 100 | Check pool leaks |

### Grafana Dashboards

1. **Application Dashboard**
   - HTTP request rate
   - Error rate
   - Latency (P50, P95, P99)
   - Active users

2. **Database Dashboard**
   - Query rate
   - Slow queries
   - Connection pool usage
   - Cache hit ratio

3. **System Dashboard**
   - CPU usage
   - Memory usage
   - Disk usage
   - Network I/O

### Alert Channels

- **PagerDuty:** SEV-1, SEV-2 incidents
- **Slack:** #alerts channel
- **Email:** oncall@servai.app
- **SMS:** +X-XXX-XXX-XXXX

---

## Database Operations 🗄️

### Run Migration

```bash
# Backup first!
pg_dump "$DATABASE_URL" | gzip > "backup-pre-migration-$(date +%Y%m%d).sql.gz"

# Run migration
cd /opt/servai/backend
npm run migrate

# Verify
psql "$DATABASE_URL" -c "SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

### Rollback Migration

```bash
# Manual rollback (no built-in rollback support)
gunzip < backup-pre-migration-YYYYMMDD.sql.gz | psql "$DATABASE_URL"
```

### Vacuum Database

```bash
# Analyze tables (quick)
psql "$DATABASE_URL" -c "ANALYZE;"

# Vacuum (removes dead rows)
psql "$DATABASE_URL" -c "VACUUM;"

# Vacuum full (locks tables, use off-peak hours)
psql "$DATABASE_URL" -c "VACUUM FULL;"
```

### Check Database Size

```bash
psql "$DATABASE_URL" << 'EOF'
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as database_size;

SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
EOF
```

---

## Emergency Procedures 🆘

### Full System Outage

```bash
# 1. Check all services
sudo systemctl status nginx
sudo systemctl status postgresql
sudo systemctl status redis
pm2 status

# 2. Start services
sudo systemctl start nginx
sudo systemctl start postgresql
sudo systemctl start redis
pm2 restart all

# 3. Verify
curl https://api.servai.app/health

# 4. If still down, check logs
journalctl -xe
pm2 logs --err
```

### Data Breach Response

```bash
# 1. IMMEDIATELY: Isolate system
sudo iptables -A INPUT -j DROP
sudo iptables -A OUTPUT -j DROP
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A OUTPUT -o lo -j ACCEPT

# 2. Notify security team
# security@servai.app

# 3. Preserve evidence
tar czf /tmp/evidence-$(date +%Y%m%d).tar.gz /var/log /opt/servai

# 4. Follow incident response plan
# (See SECURITY_INCIDENT_PLAN.md)
```

### Database Corruption

```bash
# 1. Stop application
pm2 stop all

# 2. Backup current state
pg_dump "$DATABASE_URL" | gzip > "corrupted-$(date +%Y%m%d).sql.gz"

# 3. Restore from last good backup
gunzip < /opt/servai/backups/servai_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"

# 4. Verify data
psql "$DATABASE_URL" -c "SELECT count(*) FROM users;"

# 5. Restart application
pm2 restart all
```

---

## Quick Reference 📝

### Important Commands

```bash
# Restart app
pm2 restart servai-api

# View logs
pm2 logs servai-api

# Check status
pm2 status

# Test health
curl localhost:3000/health

# Backup DB
pg_dump "$DATABASE_URL" | gzip > backup.sql.gz

# Restore DB
gunzip < backup.sql.gz | psql "$DATABASE_URL"

# Clear Redis
redis-cli FLUSHALL

# Check metrics
curl localhost:3000/metrics
```

### Important URLs

- **Production API:** https://api.servai.app
- **Health Check:** https://api.servai.app/health
- **Metrics:** http://internal-ip:3000/metrics
- **Grafana:** https://grafana.servai.app
- **Prometheus:** https://prometheus.servai.app
- **Status Page:** https://status.servai.app

### Contact Information

- **On-Call:** +X-XXX-XXX-XXXX
- **DevOps Lead:** devops@servai.app
- **Security Team:** security@servai.app
- **CTO:** cto@servai.app

---

**Runbook Version:** 1.0  
**Last Updated:** January 6, 2026  
**Next Review:** February 6, 2026
