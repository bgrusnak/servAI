# servAI - AI Platform for Property Management

servAI is a SaaS platform for property management companies and residential complexes where residents, staff, and administration interact through an AI assistant in Telegram and a web admin panel.

## Technology Stack

- **Backend**: Node.js + Express, PostgreSQL, BullMQ
- **Frontend**: Vue 3 + Quasar (planned)
- **Hosting**: Docker (backend, frontend, worker, database)
- **AI**: Perplexity Sonar API for NLU and response generation
- **Integrations**: Telegram Bot, Stripe Payments

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
- `JWT_SECRET` - Use a strong random string (min 32 characters)
- `POSTGRES_PASSWORD` - Strong database password

**Required for full functionality:**
- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `PERPLEXITY_API_KEY` - From Perplexity AI
- `STRIPE_SECRET_KEY` - From Stripe Dashboard (for payments)
- `STRIPE_WEBHOOK_SECRET` - From Stripe Webhooks

**Production only:**
- `ALLOWED_ORIGINS` - Comma-separated list of allowed domains (e.g., `https://yourdomain.com,https://admin.yourdomain.com`)

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

**Migrations run automatically** when backend starts. No manual steps needed!

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

## Production Deployment

### Prerequisites

- Docker and Docker Compose
- Valid SSL certificates
- Domain name configured

### Production Setup

1. **Create production environment file:**
```bash
cp .env.example .env.production
```

2. **Edit `.env.production` with production values:**

**REQUIRED:**
- `NODE_ENV=production`
- `JWT_SECRET` - Strong random string (use `openssl rand -base64 32`)
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

### Backup and Restore

**Database Backup:**
```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%Y%m%d).sql

# Or use the backup volume
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > /backups/backup_$(date +%Y%m%d).sql
```

**Database Restore:**
```bash
# Restore from backup
cat backup_20260106.sql | docker-compose -f docker-compose.prod.yml exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB
```

**Automated Backups:**
Set up a cron job:
```bash
0 2 * * * cd /path/to/servAI && docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U servai servai > /backups/servai_$(date +\%Y\%m\%d).sql
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

## Health Checks

### Endpoints

- `GET /health` - Simple liveness probe (always returns 200)
- `GET /ready` - Readiness probe (checks DB, Redis, migrations)
- `GET /health/integrations` - External integration health (Telegram, Perplexity, Stripe)

### Monitoring

Recommended monitoring setup:

1. **Liveness**: Monitor `/health` - should always return 200
2. **Readiness**: Monitor `/ready` - 200 = ready to serve traffic
3. **Integrations**: Monitor `/health/integrations` - detect external API issues

## Troubleshooting

**Backend won't start:**
- Check if PostgreSQL is healthy: `docker-compose ps`
- View backend logs: `docker-compose logs backend`
- Verify DATABASE_URL in .env is correct

**Migrations failed:**
- Check backend logs for specific error
- Migrations are transactional - failed migration won't partially apply
- Fix the issue and restart: `docker-compose restart backend`

**Worker not processing jobs:**
- Check if Redis is running: `docker-compose ps redis`
- View worker logs: `docker-compose logs worker`
- Verify REDIS_URL in .env

**Connection refused errors:**
- Wait 30-40 seconds after `docker-compose up` for all services to start
- Check health status: `curl http://localhost:3000/health`

**Rate limiting issues:**
- Rate limiter uses Redis for distributed state
- If Redis is down, rate limiting falls back to memory (not distributed)
- Check Redis: `docker-compose logs redis`

**Cache not working:**
- Auth caching requires Redis
- If Redis is unavailable, falls back to DB queries (slower but works)
- Check `/ready` endpoint for Redis status

## API Documentation

API documentation is available in `openapi.yaml`.

**Base URL:** `http://localhost:3000/api`

**Health checks:**
- `GET /health` - Liveness probe
- `GET /ready` - Readiness probe
- `GET /health/integrations` - External APIs health

**API endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/companies` - List companies (super_admin only)
- `GET /api/condos` - List condos
- `GET /api/units` - List units
- `GET /api/users/me` - Current user info

## Security Notes

⚠️ **Before deploying to production:**

1. ✅ Change `JWT_SECRET` to a strong random value (32+ chars)
2. ✅ Use strong database passwords
3. ✅ Set `ALLOWED_ORIGINS` to your actual domain(s)
4. ✅ Never commit `.env` or `.env.production` to git
5. ✅ Use HTTPS for all external communications
6. ✅ Keep API keys in secure secret management (Vault, AWS Secrets Manager, etc.)
7. ✅ Enable firewall rules to restrict database/Redis access
8. ✅ Regularly update dependencies: `npm audit`
9. ✅ Monitor logs for suspicious activity
10. ✅ Set up automated backups

## Performance Notes

- **Auth caching**: User data cached in Redis for 5 minutes (reduces DB load)
- **Rate limiting**: Distributed via Redis (works across multiple instances)
- **Connection pooling**: PostgreSQL pool with leak detection
- **Advisory locks**: Prevent concurrent migrations
- **Slow query detection**: Queries >1s logged as warnings

## Architecture

```
servAI/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration & constants
│   │   ├── db/              # Database, migrations
│   │   │   └── migrations/  # SQL migration files
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (planned)
│   │   ├── utils/           # Utilities (logger, Redis)
│   │   ├── server.ts        # Express server
│   │   └── worker.ts        # Background worker (BullMQ)
│   ├── logs/                # Application logs (Docker volume)
│   ├── Dockerfile           # Development Dockerfile
│   ├── Dockerfile.prod      # Production Dockerfile (multi-stage)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # Vue 3 + Quasar (planned)
├── docs/                    # Documentation
│   ├── BRIEF V1.md         # MVP requirements
│   └── tasks.md            # Task breakdown
├── docker-compose.yml       # Development compose
├── docker-compose.prod.yml  # Production compose
├── .env.example             # Environment template
└── README.md
```

## License

Proprietary

## Support

For support, please contact: support@servai.example
