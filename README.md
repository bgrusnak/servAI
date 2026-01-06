# servAI - AI Platform for Property Management

servAI is a SaaS platform for property management companies and residential complexes where residents, staff, and administration interact through an AI assistant in Telegram and a web admin panel.

## Technology Stack

- **Backend**: Node.js + Express, PostgreSQL, BullMQ, Redis
- **Frontend**: Vue 3 + Quasar (planned)
- **Hosting**: Docker (backend, frontend, worker, database)
- **AI**: Perplexity Sonar API for NLU and response generation
- **Integrations**: Telegram Bot, Stripe Payments

## Architecture Highlights

✅ **Single migration approach** - One complete schema, no migration conflicts  
✅ **Soft delete everywhere** - All tables have `deleted_at`, nothing is lost  
✅ **Database views** - `*_active` views for easy querying without soft-deleted records  
✅ **Refresh token rotation** - Enterprise-grade auth with automatic token rotation  
✅ **Token revocation check** - Access tokens verified against revocation in real-time  
✅ **Redis caching** - User data and auth cached for performance  
✅ **Distributed rate limiting** - Redis-backed rate limiter works across multiple instances  
✅ **Advisory locks** - Prevent concurrent migrations  
✅ **Batch cleanup** - Cleanup jobs process records in batches to avoid table locks  
✅ **Scheduled jobs** - Automatic cleanup with cron patterns  
✅ **Password validation** - Configurable password strength requirements  
✅ **Connection leak detection** - Automatic detection and cleanup of leaked DB connections  

## Quick Start (Development)

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development without Docker)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/bgrusnak/servAI.git
cd servAI
```

2. **⚠️ IMPORTANT: Configure environment variables**
```bash
cp .env.example .env
```

3. **Edit `.env` and set required values:**

**CRITICAL - Must change in production:**
- `JWT_SECRET` - Use a strong random string (min 32 characters): `openssl rand -base64 32`
- `POSTGRES_PASSWORD` - Strong database password

**Required for full functionality:**
- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `PERPLEXITY_API_KEY` - From Perplexity AI
- `STRIPE_SECRET_KEY` - From Stripe Dashboard (for payments)
- `STRIPE_WEBHOOK_SECRET` - From Stripe Webhooks

**Production only:**
- `ALLOWED_ORIGINS` - Comma-separated list of allowed domains (e.g., `https://yourdomain.com,https://admin.yourdomain.com`)

**Optional tunables:**
- `CACHE_USER_TTL_SECONDS` - User cache TTL (default: 300)
- `JWT_REFRESH_TOKEN_TTL_DAYS` - Refresh token lifetime (default: 7)
- `JWT_REFRESH_TOKEN_ROTATION` - Enable token rotation (default: true)
- `PASSWORD_MIN_LENGTH` - Minimum password length (default: 8)
- `CLEANUP_BATCH_SIZE` - Cleanup batch size (default: 1000)

4. **Start services:**
```bash
docker-compose up -d
```

5. **Wait for services to be ready:**
```bash
# Check backend health
curl http://localhost:3000/health

# Check if migrations completed and all dependencies ready
curl http://localhost:3000/ready

# Check external integrations
curl http://localhost:3000/health/integrations
```

**Migration runs automatically** when backend starts. Only ONE migration file with complete schema!

6. **View logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f worker
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v
```

## Database Architecture

### Soft Delete Pattern

All tables have `deleted_at TIMESTAMP WITH TIME ZONE` column. Instead of `DELETE`, we use:

```sql
UPDATE table_name SET deleted_at = NOW() WHERE id = $1;
```

### Database Views

For convenience, active records views are created automatically:

- `companies_active` - only non-deleted companies
- `users_active` - only non-deleted users
- `tickets_active` - only non-deleted tickets
- etc.

**Usage in queries:**
```sql
-- Instead of:
SELECT * FROM users WHERE deleted_at IS NULL;

-- Use:
SELECT * FROM users_active;
```

**All existing code uses base tables with explicit `WHERE deleted_at IS NULL` for consistency.**

### Token Management

**Access Token (15 min):**
- Short-lived JWT
- Contains `userId` and `tokenId` (refresh token ID)
- Verified on every request
- Checked against revocation (Redis + DB)

**Refresh Token (7 days):**
- Long-lived, stored in database
- Automatically rotated on use (old revoked, new issued)
- Tracks IP and User-Agent for security
- Rate limited (10 refreshes per minute per user)

**Logout:**
- Single device: revokes one refresh token
- All devices: revokes all user's refresh tokens
- Revoked tokens cached in Redis for fast checks

## Production Deployment

### Prerequisites

- Docker and Docker Compose
- Valid SSL certificates
- Domain name configured
- Secrets management (Vault, AWS Secrets Manager, etc.)

### Production Setup

1. **Create production environment file:**
```bash
cp .env.example .env.production
```

2. **Edit `.env.production` with production values:**

**REQUIRED:**
- `NODE_ENV=production`
- `JWT_SECRET` - Strong random string (`openssl rand -base64 32`)
- `POSTGRES_PASSWORD` - Strong password
- `DATABASE_URL` - Production database URL
- `REDIS_URL` - Production Redis URL
- `ALLOWED_ORIGINS` - Your domain(s)
- All API keys (Telegram, Perplexity, Stripe)

3. **Build and start production:**
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
```

4. **Verify deployment:**
```bash
curl https://yourdomain.com/health
curl https://yourdomain.com/ready
curl https://yourdomain.com/health/integrations
```

### Production Features

- ✅ Multi-stage Docker build (smaller images)
- ✅ Non-root user for security
- ✅ Compiled TypeScript (no ts-node)
- ✅ Production-only dependencies
- ✅ Persistent volumes for data, logs, uploads
- ✅ Automatic restarts
- ✅ Health checks for all services
- ✅ Redis persistence (AOF)
- ✅ Network isolation
- ✅ Advisory locks for migrations
- ✅ Connection leak detection

### Backup and Restore

**Database Backup:**
```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use the backup volume
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB > /backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

**Database Restore:**
```bash
# Restore from backup
cat backup_20260106_160000.sql | \
  docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER $POSTGRES_DB
```

**Automated Backups (cron):**
```bash
# Add to crontab
0 2 * * * cd /path/to/servAI && docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U servai servai | gzip > /backups/servai_$(date +\%Y\%m\%d).sql.gz

# Cleanup old backups (keep 30 days)
0 3 * * * find /backups -name 'servai_*.sql.gz' -mtime +30 -delete
```

## Development Without Docker

### Backend

```bash
cd backend
npm install

# Make sure PostgreSQL and Redis are running locally
# Update .env with local connection strings

npm run dev
```

### Worker

```bash
cd backend
npm run worker
```

### Run migrations manually (if needed)

```bash
cd backend
npm run migrate
```

## API Documentation

### Health Checks

- `GET /health` - Simple liveness probe (always returns 200)
- `GET /ready` - Readiness probe (checks DB, Redis, migrations)
- `GET /health/integrations` - External integration health (Telegram, Perplexity, Stripe)

### Authentication

**Register (TODO):**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Login (TODO):**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

Response:
{
  "accessToken": "eyJhbG...",
  "refreshToken": "a1b2c3d4..."
}
```

**Refresh Token:**
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4..."
}

Response:
{
  "accessToken": "eyJhbG...",
  "refreshToken": "e5f6g7h8..."  # New token (rotated)
}
```

**Logout:**
```bash
POST /api/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4..."
}
```

**Logout All Devices:**
```bash
POST /api/auth/logout-all
Authorization: Bearer <accessToken>
```

## Troubleshooting

**Backend won't start:**
- Check if PostgreSQL is healthy: `docker-compose ps`
- View backend logs: `docker-compose logs backend`
- Verify DATABASE_URL in .env is correct
- Check if port 3000 is available

**Migrations failed:**
- Check backend logs for specific error: `docker-compose logs backend | grep -i migration`
- Migrations are transactional - failed migration won't partially apply
- Migration uses advisory locks - only one instance can run migrations
- Fix the issue and restart: `docker-compose restart backend`

**Worker not processing jobs:**
- Check if Redis is running: `docker-compose ps redis`
- View worker logs: `docker-compose logs worker`
- Verify REDIS_URL in .env
- Check scheduled jobs: worker schedules cleanup jobs on startup

**Token errors:**
- "Token has been revoked" - user logged out or tokens refreshed
- "Too many refresh requests" - rate limit hit (10/min per user)
- "Invalid refresh token" - token expired or doesn't exist
- Check Redis for blacklisted tokens: `redis-cli KEYS "token:revoked:*"`

**Rate limiting issues:**
- Rate limiter uses Redis for distributed state
- If Redis is down, rate limiting falls back to memory (not distributed)
- Check Redis: `docker-compose logs redis`
- Clear rate limits: `redis-cli FLUSHDB` (dev only!)

**Cache not working:**
- Auth caching requires Redis
- If Redis is unavailable, falls back to DB queries (slower but works)
- Check `/ready` endpoint for Redis status
- Clear cache: `redis-cli KEYS "user:*" | xargs redis-cli DEL`

**Cleanup jobs not running:**
- Check worker logs: `docker-compose logs worker | grep cleanup`
- Jobs scheduled on worker startup with cron patterns
- Verify job schedule: invites (2 AM), audit (3 AM), telegram (4 AM), tokens (5 AM)
- Check BullMQ: `redis-cli KEYS "bull:cleanup:*"`

## Security Checklist

⚠️ **Before deploying to production:**

- [ ] Change `JWT_SECRET` to strong random value (32+ chars)
- [ ] Use strong database passwords
- [ ] Set `ALLOWED_ORIGINS` to actual domain(s)
- [ ] Never commit `.env` or `.env.production` to git
- [ ] Use HTTPS for all external communications
- [ ] Store API keys in secure secret management
- [ ] Enable firewall rules to restrict database/Redis access
- [ ] Regularly update dependencies: `npm audit`
- [ ] Monitor logs for suspicious activity
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Enable 2FA for admin accounts (when implemented)
- [ ] Review and adjust password requirements
- [ ] Set up rate limiting at nginx/LB level
- [ ] Enable DDoS protection (Cloudflare, etc.)
- [ ] Regular security audits

## Performance Tuning

### Redis Caching

- User data cached for 5 minutes (configurable)
- Revoked tokens cached for 15 minutes (access token TTL)
- Rate limit counters expire after window

### Database

- Connection pool with leak detection
- Slow query logging (>1s)
- Partial indexes on `deleted_at IS NULL`
- Batch cleanup to avoid table locks

### Rate Limiting

- API: 100 requests/min per IP
- Auth: 5 attempts/15min per IP
- Refresh: 10 requests/min per user
- All distributed via Redis

### Cleanup Jobs

- Run daily at night (low traffic)
- Process in batches (1000 records)
- Small delays between batches (100ms)
- Soft delete only (can be restored)

## Architecture

```
servAI/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.ts          # Main config
│   │   │   └── constants.ts      # Configurable constants
│   │   ├── db/
│   │   │   ├── index.ts          # Connection pool + helpers
│   │   │   ├── migrate.ts        # Migration runner with advisory locks
│   │   │   └── migrations/
│   │   │       └── 001_init_complete_schema.sql  # Single migration
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT + revocation check + caching
│   │   │   ├── errorHandler.ts   # Error sanitization
│   │   │   ├── rateLimiter.ts    # Redis-backed rate limiting
│   │   │   └── requestLogger.ts
│   │   ├── routes/
│   │   │   ├── index.ts          # API router
│   │   │   └── auth.ts           # Auth endpoints
│   │   ├── services/
│   │   │   └── auth.service.ts   # Token management + password validation
│   │   ├── utils/
│   │   │   ├── logger.ts         # Winston structured logging
│   │   │   └── redis.ts          # Redis client wrapper
│   │   ├── server.ts             # Express app + health checks
│   │   └── worker.ts             # BullMQ worker + scheduled jobs
│   ├── logs/                     # Application logs (Docker volume)
│   ├── Dockerfile                # Development
│   ├── Dockerfile.prod           # Production (multi-stage)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                     # Vue 3 + Quasar (planned)
├── docs/
│   ├── BRIEF V1.md
│   └── tasks.md
├── docker-compose.yml            # Development
├── docker-compose.prod.yml       # Production
├── .env.example
└── README.md
```

## What's Implemented

✅ Complete database schema (50+ tables)  
✅ Soft delete on all tables  
✅ Database views for active records  
✅ Refresh token rotation  
✅ Token revocation checking  
✅ Password validation  
✅ Redis caching for auth  
✅ Distributed rate limiting  
✅ Advisory locks for migrations  
✅ Batch cleanup jobs  
✅ Scheduled cron jobs  
✅ Connection leak detection  
✅ Health checks (3 endpoints)  
✅ Docker development setup  
✅ Docker production setup  
✅ Graceful shutdown  
✅ Structured logging  
✅ Error sanitization  

## What's TODO

🔄 User registration endpoint  
🔄 User login endpoint  
🔄 CRUD for companies, condos, units  
🔄 Telegram bot integration  
🔄 Perplexity Sonar NLU  
🔄 Excel import for units  
🔄 Meter readings management  
🔄 Tickets system  
🔄 Notifications  
🔄 Stripe billing  
🔄 Frontend (Vue 3 + Quasar)  
🔄 Automated tests  
🔄 OpenAPI documentation  
🔄 Prometheus metrics  
🔄 Load testing  

## License

Proprietary

## Support

For support, please contact: support@servai.example
