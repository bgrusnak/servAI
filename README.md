# servAI - AI Platform for Property Management

servAI is a SaaS platform for property management companies and residential complexes where residents, staff, and administration interact through an AI assistant in Telegram and a web admin panel.

## Technology Stack

- **Backend**: Node.js + Express, PostgreSQL, BullMQ
- **Frontend**: Vue 3 + Quasar
- **Hosting**: Docker (backend, frontend, worker, database)
- **AI**: Perplexity Sonar API for NLU and response generation
- **Integrations**: Telegram Bot, Stripe Payments

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL 15+ (if running without Docker)
- Redis 7+ (if running without Docker)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bgrusnak/servAI.git
cd servAI
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and set your API keys:
- `TELEGRAM_BOT_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PERPLEXITY_API_KEY`
- `JWT_SECRET`

4. Start with Docker Compose:
```bash
docker-compose up -d
```

5. Run migrations:
```bash
docker-compose exec backend npm run migrate
```

### Development

#### Backend

```bash
cd backend
npm install
npm run dev
```

#### Run migrations

```bash
npm run migrate
```

#### Create new migration

```bash
npm run migrate:create <migration_name>
```

### API Documentation

API documentation is available in `openapi.yaml`.

### Project Structure

```
servAI/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── db/              # Database and migrations
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities
│   │   ├── server.ts        # Express server
│   │   └── worker.ts        # Background worker
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # Vue 3 + Quasar (to be implemented)
├── docs/                   # Documentation
├── docker-compose.yml
├── .env.example
└── README.md
```

## Features (MVP)

### Telegram Bot
- Natural language dialog for residents
- Meter readings submission (text + photo with OCR)
- Service request creation
- Payment notifications and history
- Task management for staff

### Admin Panel
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

## License

Proprietary

## Support

For support, please contact: support@servai.example
