# servAI - Smart Condo Management Platform

🏠 **Enterprise-grade platform for managing condominiums with AI-powered Telegram bot assistant**

## 🌟 Features

### 💼 Core Platform
- ✅ Multi-company & multi-condo management
- ✅ Building & unit management with soft delete
- ✅ Resident management with role-based access
- ✅ Invite system with tokens
- ✅ Comprehensive audit logging

### 📊 Business Features
- ✅ **Meter Readings** - Manual, OCR from photos, auto-calculation
- ✅ **Invoices & Payments** - Auto-generation, Stripe integration
- ✅ **Polls & Voting** - Quorum support, anonymous voting
- ✅ **Tickets** - Support system with categories and SLA
- ✅ **Vehicle Access** - License plate tracking
- ✅ **Documents** - S3/MinIO storage with signed URLs

### 🤖 AI Telegram Bot
- ✅ Natural language conversation
- ✅ Intent recognition via Perplexity AI
- ✅ OCR for meter readings from photos
- ✅ Multi-language support
- ✅ Context-aware responses
- ✅ **Production-ready rate limiting with BullMQ**

### 🚀 Real-time Features
- ✅ **WebSocket support** - Live updates for tickets, polls, notifications
- ✅ Room-based subscriptions (user, condo, ticket)
- ✅ Online users tracking

### 💳 Payment Processing
- ✅ **Stripe integration** - Payment intents, webhooks
- ✅ Multiple payment methods support
- ✅ Automatic invoice reconciliation

### 📤 File Management
- ✅ **S3/MinIO integration** - Scalable file storage
- ✅ Document upload with metadata
- ✅ Signed URLs for secure access
- ✅ Meter photo upload for OCR

## 🛠️ Tech Stack

### Backend
- **Node.js 18+** + **TypeScript 5**
- **Express.js** - REST API
- **PostgreSQL 15** - Primary database
- **Redis 7** - Caching & BullMQ
- **BullMQ** - Job queue
- **Socket.IO** - WebSocket
- **Stripe** - Payments
- **AWS SDK** - S3/MinIO
- **Telegram Bot API**
- **Perplexity AI**

## 📚 API Documentation

See full documentation at [backend/API.md](backend/API.md)

### Quick Examples

```bash
# Login
POST /api/v1/auth/login

# Submit meter reading
POST /api/v1/meters/:id/readings

# Get invoices
GET /api/v1/invoices

# Create poll
POST /api/v1/polls

# Create ticket
POST /api/v1/tickets
```

## 🚀 Quick Start

```bash
git clone https://github.com/bgrusnak/servAI.git
cd servAI
cp backend/.env.example backend/.env
# Edit .env with your credentials
docker-compose up -d
docker-compose exec backend npm run migrate
```

**Access:** http://localhost:3000

## 📊 Status

```
Backend:    ✅ 100% COMPLETE - Production Ready v1.0.0
Frontend:   ⚪ 0% - Not started
```

---

**Built with ❤️ by servAI Team**
