# servAI - AI Platform for Property Management

servAI is a SaaS platform for property management companies and residential complexes where residents, staff, and administration interact through an AI assistant in Telegram and a web admin panel.

## Technology Stack

- **Backend**: Node.js + Express, PostgreSQL, BullMQ
- **Frontend**: Vue 3 + Quasar (planned)
- **Hosting**: Docker (backend, frontend, worker, database)
- **AI**: Perplexity Sonar API for NLU and response generation
- **Integrations**: Telegram Bot, Stripe Payments

## Quick Start

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
- `ALLOWED_ORIGINS` - Comma-separated list of allowed domains

4. **Start services:**
```bash
docker-compose up -d
```

5. **Wait for services to be ready:**
```bash
# Check backend health
curl http://localhost:3000/health

# Check if migrations completed
curl http://localhost:3000/ready
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

### Development Without Docker

#### Backend

```bash
cd backend
npm install

# Make sure PostgreSQL and Redis are running locally
# Update .env with local connection strings

npm run dev
```

#### Worker

```bash
cd backend
npm run worker
```

#### Run migrations manually (if needed)

```bash
cd backend
npm run migrate
```

### Troubleshooting

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

## API Documentation

API documentation is available in `openapi.yaml`.

**Base URL:** `http://localhost:3000/api`

**Health checks:**
- `GET /health` - Simple health check
- `GET /ready` - Readiness check (includes DB and migrations)

**API endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/companies` - List companies (super_admin only)
- `GET /api/condos` - List condos
- `GET /api/units` - List units
- `GET /api/users/me` - Current user info

## Project Structure

```
servAI/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── db/              # Database, migrations
│   │   │   └── migrations/  # SQL migration files
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic (planned)
│   │   ├── utils/           # Utilities
│   │   ├── server.ts        # Express server
│   │   └── worker.ts        # Background worker (BullMQ)
│   ├── logs/                # Application logs (Docker volume)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # Vue 3 + Quasar (planned)
├── docs/                    # Documentation
│   ├── BRIEF V1.md         # MVP requirements
│   └── tasks.md            # Task breakdown
├── docker-compose.yml       # Docker orchestration
├── .env.example             # Environment template
└── README.md
```

## Features (MVP)

### Telegram Bot
- Natural language dialog for residents
- Meter readings submission (text + photo with OCR)
- Service request creation
- Payment notifications and history
- Task management for staff

### Admin Panel (Planned)
- Multi-tenant architecture (companies/condos)
- Unit management and Excel import
- Service request queue
- Tariff management
- Billing and invoicing
- User and role management

### Integrations
- **Telegram**: Bot for residents and staff
- **Perplexity Sonar**: NLU and AI response generation
- **Stripe**: Payment processing
- **BullMQ**: Background jobs (imports, billing, notifications)

## Security Notes

⚠️ **Before deploying to production:**

1. Change `JWT_SECRET` to a strong random value
2. Use strong database passwords
3. Set `ALLOWED_ORIGINS` to your actual domain(s)
4. Never commit `.env` file to git
5. Use HTTPS for all external communications
6. Keep API keys in secure secret management (not in .env in production)

## License

Proprietary

## Support

For support, please contact: support@servai.example
