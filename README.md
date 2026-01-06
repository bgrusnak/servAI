# servAI - Smart Condo Management Platform

🏠 **Comprehensive platform for managing condominiums with AI-powered Telegram bot assistant**

## Features

### Core Platform
- Multi-condo management
- Unit & resident management
- Financial tracking (invoices, payments)
- Voting system
- Ticket management
- Vehicle access control
- Utility meter readings
- Document management
- Audit logging

### AI Telegram Bot
- Natural language conversation
- Intent recognition via Perplexity AI
- OCR for meter readings from photos
- Multi-language support
- Context-aware responses
- **Production-ready rate limiting with BullMQ**

## Tech Stack

### Backend
- **Node.js** + **TypeScript**
- **Express.js** - REST API
- **PostgreSQL** - Database
- **Redis** - Caching & BullMQ queue
- **BullMQ** - Modern job queue for Telegram rate limiting
- **IORedis** - High-performance Redis client
- **Telegram Bot API** - Bot interface
- **Perplexity AI (Sonar)** - Intent recognition & OCR
- **Stripe** - Payment processing
- **Prometheus** - Metrics
- **Winston** - Logging

### Frontend
- **Vue.js 3** + **TypeScript**
- **Vuetify** - UI components
- **Pinia** - State management
- **Vite** - Build tool

### Infrastructure
- **Docker** + **Docker Compose**
- **PostgreSQL 15**
- **Redis 7**

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Perplexity API Key (from [perplexity.ai](https://www.perplexity.ai/))

### Setup

1. **Clone repository**
```bash
git clone https://github.com/bgrusnak/servAI.git
cd servAI
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env and set:
# - TELEGRAM_BOT_TOKEN
# - PERPLEXITY_API_KEY
# - JWT_SECRET (generate random string)
```

3. **Start services**
```bash
docker-compose up -d
```

4. **Run database migrations**
```bash
docker-compose exec backend npm run migrate
```

5. **Access application**
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health
- Metrics: http://localhost:3000/metrics

## Telegram Bot Rate Limiting

### Implementation

The bot uses **BullMQ** (modern successor to Bull) with Redis for production-ready rate limiting:

```typescript
// Configurable via environment
TELEGRAM_RATE_LIMIT_PER_SECOND=25  // Default: 25 msg/sec
```

### Features

✅ **Automatic rate limiting** (25 messages/second by default)
✅ **429 handling** - Respects Telegram's `Retry-After` header
✅ **FloodWait handling** - Delays messages to same chat
✅ **Priority support** - Critical messages sent first
✅ **Exponential backoff** - 3 retries with increasing delays
✅ **Graceful fallback** - Direct send if queue fails
✅ **Metrics** - Queue size, delays, errors via Prometheus

### Why BullMQ?

| Feature | Without Queue | With BullMQ |
|---------|--------------|-------------|
| **Non-blocking** | ❌ Blocks event loop | ✅ Async processing |
| **Rate limiting** | ❌ Manual throttling | ✅ Built-in limiter |
| **Retry logic** | ⚠️ Basic | ✅ Advanced with backoff |
| **Scalability** | ❌ Single instance | ✅ Multi-instance via Redis |
| **Monitoring** | ❌ None | ✅ Prometheus metrics |
| **Priority** | ❌ FIFO only | ✅ Priority queue |
| **Modern API** | ❌ Bull (legacy) | ✅ BullMQ (TypeScript-first) |
| **Performance** | ⚠️ Redis 3.x | ✅ Redis 7.x optimized |

### Telegram API Limits

| Limit Type | Value | Our Protection |
|-----------|-------|----------------|
| Group messages | 20/min | ✅ Tracked per chat |
| Different chats | 30/sec | ✅ Global limiter (25/sec) |
| Same chat | 1/sec | ✅ FloodWait handler |

### Queue Metrics

```prometheus
telegram_queue_size          # Current queue size
telegram_queue_delayed       # Delayed jobs count
telegram_messages_total{status="queued|sent|rate_limited|flood_wait"}
```

## Architecture

### Database Schema

```
condos → buildings → units → residents ← users
                              ↓
                        telegram_users → conversations
                              ↓
                        user_context
```

### Services

- **telegram.service.ts** - Bot logic + BullMQ Queue
- **worker.ts** - Background job processor (BullMQ Worker)
- **perplexity.service.ts** - AI integration
- **auth.service.ts** - Authentication
- **payment.service.ts** - Stripe integration

## Development

### Local Development (without Docker)

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run migrations
cd backend && npm run migrate

# Start backend
npm run dev

# Start worker (separate terminal)
npm run worker

# Start frontend (separate terminal)
cd frontend && npm run dev
```

### Testing

```bash
# Backend tests
cd backend
npm test
npm run test:coverage

# Frontend tests
cd frontend
npm test
```

### Code Quality

```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
```

## Environment Variables

### Required

```env
TELEGRAM_BOT_TOKEN=your_bot_token
PERPLEXITY_API_KEY=your_api_key
JWT_SECRET=strong_random_string_change_in_production
REDIS_URL=redis://localhost:6379
```

### Optional

```env
# Telegram
TELEGRAM_USE_WEBHOOK=false              # Use polling (dev) or webhook (prod)
TELEGRAM_WEBHOOK_URL=https://api.example.com
TELEGRAM_RATE_LIMIT_PER_SECOND=25      # Message rate limit

# AI
SONAR_MODEL=llama-3.1-sonar-small-128k-online
SONAR_MAX_TOKENS=4096
SONAR_TEMPERATURE=0.2
CONVERSATION_HISTORY_LIMIT=20
INTENT_CONFIDENCE_THRESHOLD=0.7

# Database
DB_POOL_MAX=20
DB_POOL_MIN=5

# Rate Limiting (REST API)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

See [.env.example](.env.example) for full list.

## Deployment

### Production Checklist

- [ ] Change `JWT_SECRET` to strong random string
- [ ] Set `NODE_ENV=production`
- [ ] Configure `TELEGRAM_USE_WEBHOOK=true`
- [ ] Set up HTTPS endpoint for `TELEGRAM_WEBHOOK_URL`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure log aggregation
- [ ] Review rate limits based on load
- [ ] Scale worker instances based on queue load

### Docker Production

```bash
# Build production image
docker-compose -f docker-compose.prod.yml build

# Start services (includes backend + worker)
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f backend worker

# Scale workers if needed
docker-compose up -d --scale worker=3
```

## API Documentation

### Authentication

```bash
# Register
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe"
}

# Login
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

### Telegram Bot

Talk to your bot on Telegram:
1. Find your bot (search by username)
2. Send `/start <invite_token>` with invite link from admin
3. Chat naturally - AI will understand intent
4. Send meter photos - OCR will read values

## Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Support

- 📧 Email: support@servai.example
- 🐛 Issues: [GitHub Issues](https://github.com/bgrusnak/servAI/issues)
- 💬 Telegram: [@servai_support](https://t.me/servai_support)

## Roadmap

- [x] Core platform features
- [x] Telegram bot with AI
- [x] Rate limiting with BullMQ (modern)
- [x] Background worker for cleanup jobs
- [ ] Mobile app (React Native)
- [ ] Email notifications
- [ ] Advanced analytics dashboard
- [ ] Multi-language UI
- [ ] Integration with smart home devices

---

**Built with ❤️ by servAI Team**
