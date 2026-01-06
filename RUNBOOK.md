# servAI Operations Runbook 🛠️

**Purpose:** Quick reference guide for common operational tasks and incident response.

---

## Quick Links

- **Health Check:** https://api.servai.app/health
- **Metrics:** https://api.servai.app/metrics
- **Grafana:** https://grafana.servai.app
- **Logs:** `/var/log/servai/` or `pm2 logs`

---

## Common Operations

### Restart Application

```bash
# PM2
pm2 restart servai-api

# Docker
docker-compose restart api

# Kubernetes
kubectl rollout restart deployment/servai-api -n servai
```

### View Logs

```bash
# PM2 - Last 100 lines
pm2 logs servai-api --lines 100

# Docker - Follow logs
docker-compose logs -f api

# Kubernetes - Last 1 hour
kubectl logs -f deployment/servai-api -n servai --since=1h

# Search for errors
pm2 logs servai-api | grep ERROR
```

### Check Application Status

```bash
# Health check
curl https://api.servai.app/health | jq .

# Expected output
{
  "status": "ok",
  "timestamp": "2026-01-06T18:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" }
  }
}
```

### Database Operations

```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('servai'));"

# Vacuum database (weekly)
psql $DATABASE_URL -c "VACUUM ANALYZE;"
```

### Backup and Restore

```bash
# Create backup
pg_dump -U servai servai | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip < backup_20260106.sql.gz | psql -U servai servai

# List backups
ls -lh /backups/servai/
```

---

## Incident Response

### High Error Rate Alert

**Symptom:** Error rate >5% for 5+ minutes

**Steps:**

1. **Check health endpoint**
   ```bash
   curl https://api.servai.app/health
   ```

2. **Review recent logs**
   ```bash
   pm2 logs servai-api --lines 50 | grep ERROR
   ```

3. **Check database connection**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

4. **Check Redis connection**
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

5. **If external service issue** (SendGrid, etc.), check status page

6. **If no obvious cause, restart application**
   ```bash
   pm2 restart servai-api
   ```

7. **Monitor for 10 minutes**

### High Response Time Alert

**Symptom:** P95 latency >1s for 5+ minutes

**Steps:**

1. **Check system resources**
   ```bash
   top
   free -h
   df -h
   ```

2. **Check database performance**
   ```bash
   psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

3. **Check for slow queries**
   ```bash
   grep "duration:" /var/log/postgresql/postgresql-14-main.log | tail -20
   ```

4. **Check connection pool**
   ```bash
   psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
   ```

5. **If high load, consider scaling horizontally**

### Database Down Alert

**Symptom:** Cannot connect to PostgreSQL

**Steps:**

1. **Check PostgreSQL status**
   ```bash
   sudo systemctl status postgresql
   ```

2. **Check PostgreSQL logs**
   ```bash
   sudo tail -50 /var/log/postgresql/postgresql-14-main.log
   ```

3. **If crashed, restart**
   ```bash
   sudo systemctl start postgresql
   ```

4. **Check disk space** (common cause)
   ```bash
   df -h
   ```

5. **If disk full, clean up**
   ```bash
   # Remove old logs
   sudo find /var/log -name "*.log" -mtime +7 -delete
   
   # Vacuum database
   psql $DATABASE_URL -c "VACUUM FULL;"
   ```

6. **Verify application reconnects**
   ```bash
   curl https://api.servai.app/health
   ```

### Out of Memory

**Symptom:** Application crashes, OOM in logs

**Steps:**

1. **Check memory usage**
   ```bash
   free -h
   ps aux --sort=-%mem | head -10
   ```

2. **Restart application**
   ```bash
   pm2 restart servai-api
   ```

3. **Reduce PM2 instances**
   ```bash
   pm2 scale servai-api 2  # Reduce to 2 instances
   ```

4. **Identify memory leak**
   ```bash
   # Enable heap profiling
   node --inspect --max-old-space-size=4096 dist/server.js
   ```

5. **If persistent, upgrade server RAM**

### SSL Certificate Expiring

**Symptom:** Alert or users report SSL errors

**Steps:**

1. **Check certificate expiry**
   ```bash
   echo | openssl s_client -servername api.servai.app -connect api.servai.app:443 2>/dev/null | openssl x509 -noout -dates
   ```

2. **Renew with certbot**
   ```bash
   sudo certbot renew --nginx
   ```

3. **Test renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

4. **Setup auto-renewal** (if not already)
   ```bash
   sudo systemctl enable certbot.timer
   sudo systemctl start certbot.timer
   ```

---

## Maintenance Tasks

### Daily

- [ ] Check health endpoint
- [ ] Review error logs
- [ ] Check Grafana dashboards

### Weekly

- [ ] Review slow query log
- [ ] Check disk space
- [ ] Vacuum database
- [ ] Review security alerts
- [ ] Update dependencies (if needed)

### Monthly

- [ ] Review and optimize database indexes
- [ ] Clean up old data (if applicable)
- [ ] Test backup restore
- [ ] Review access logs for anomalies
- [ ] Update SSL certificates (if manual)
- [ ] Run load tests

### Quarterly

- [ ] Security audit
- [ ] Dependency updates
- [ ] Performance review
- [ ] Capacity planning
- [ ] Disaster recovery drill

---

## Performance Optimization

### Add Database Index

```sql
-- Find missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;

-- Create index
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE deleted_at IS NULL;
```

### Enable Query Result Caching

```typescript
// Add Redis caching
import { redis } from './utils/redis';

async function getCompanies(userId: string) {
  const cacheKey = `companies:${userId}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Query database
  const companies = await db.query(...);
  
  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(companies), 300);
  
  return companies;
}
```

### Optimize Docker Images

```dockerfile
# Use multi-stage build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## Security Incidents

### Suspected Breach

1. **Immediately**
   - [ ] Rotate JWT_SECRET
   - [ ] Revoke all refresh tokens
   - [ ] Change database password
   - [ ] Review access logs

2. **Investigation**
   - [ ] Check for unauthorized API calls
   - [ ] Review authentication logs
   - [ ] Check for data exfiltration
   - [ ] Analyze traffic patterns

3. **Communication**
   - [ ] Notify team
   - [ ] Prepare user communication
   - [ ] Document incident

### DDoS Attack

1. **Enable rate limiting** (if not already)
   ```bash
   # Nginx rate limiting
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   limit_req zone=api burst=20 nodelay;
   ```

2. **Block malicious IPs**
   ```bash
   # Firewall
   sudo ufw deny from 1.2.3.4
   
   # Nginx
   deny 1.2.3.4;
   ```

3. **Enable Cloudflare** (or similar DDoS protection)

---

## Contact Information

### On-Call Rotation

- **Primary:** +7-XXX-XXX-XXXX
- **Secondary:** +7-XXX-XXX-XXXX
- **Manager:** +7-XXX-XXX-XXXX

### External Services

- **SendGrid Support:** https://support.sendgrid.com
- **DigitalOcean Status:** https://status.digitalocean.com
- **PostgreSQL Support:** https://www.postgresql.org/support/

---

## Useful Commands Cheat Sheet

```bash
# System
df -h                    # Disk space
free -h                  # Memory
top                      # CPU/Memory usage
netstat -tulpn          # Open ports

# PM2
pm2 list                # List processes
pm2 monit               # Monitor
pm2 logs <app> --lines 100
pm2 restart <app>
pm2 stop <app>
pm2 delete <app>

# Docker
docker ps               # List containers
docker logs -f <container>
docker exec -it <container> sh
docker-compose up -d
docker-compose down

# PostgreSQL
psql $DATABASE_URL
\dt                      # List tables
\d+ <table>             # Describe table
\x                      # Expanded display

# Redis
redis-cli -u $REDIS_URL
INFO                    # Server info
KEYS *                  # List keys (dev only!)
MONITOR                 # Monitor commands

# Git
git log --oneline -10   # Recent commits
git diff HEAD~1         # Last changes
git checkout <tag>      # Switch version
```

---

**Last Updated:** January 6, 2026  
**Maintainer:** DevOps Team
