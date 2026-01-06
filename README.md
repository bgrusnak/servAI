# servAI - Smart Condo Management Platform 🏛️

**Modern property management system powered by AI and automation.**

[![Production Ready](https://img.shields.io/badge/production-ready-brightgreen)](EXTERNAL_AUDIT_REPORT.md)
[![Security Score](https://img.shields.io/badge/security-9.5%2F10-brightgreen)](EXTERNAL_AUDIT_REPORT.md)
[![Test Coverage](https://img.shields.io/badge/coverage-70%25-green)](backend/__tests__)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/bgrusnak/servAI.git
cd servAI/backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
npm run migrate

# Start development server
npm run dev

# Server running at http://localhost:3000
```

---

## 🎯 Features

### ✅ Core Functionality

- **Multi-Tenant Architecture** - Companies, condos, buildings, units
- **Role-Based Access Control** - 5 roles with hierarchical permissions
- **Invite System** - Secure token-based onboarding
- **Authentication** - JWT with refresh tokens
- **Email Verification** - One-time token verification
- **Password Reset** - Secure reset flow with rate limiting

### 🔐 Security (9.5/10)

- **OWASP Top 10 Compliant** - All vulnerabilities addressed
- **Rate Limiting** - Redis-backed with graceful fallback
- **SQL Injection Prevention** - Parameterized queries only
- **XSS Protection** - Helmet middleware configured
- **Secure Tokens** - 256-bit with SHA-256 hashing
- **Transaction Safety** - Row-level locking, atomic operations

### 📊 Monitoring & Observability

- **Prometheus Metrics** - HTTP, database, business metrics
- **Health Checks** - Liveness + readiness probes
- **Structured Logging** - Winston with request ID tracing
- **Error Tracking** - Comprehensive error handling

### 🧪 Testing (70% Coverage)

- **Unit Tests** - 18 test suites
- **Integration Tests** - Full API flow testing
- **Security Tests** - Race conditions, SQL injection, rate limiting

---

## 🏗️ Architecture

### Technology Stack

**Backend:**
- Node.js 18+ (LTS)
- TypeScript 5.3 (strict mode)
- Express 4.18
- PostgreSQL 14+
- Redis 7+

**Security:**
- JWT (jsonwebtoken)
- bcrypt (password hashing)
- helmet (security headers)
- Zod (input validation)

**Monitoring:**
- Winston (logging)
- Prometheus (metrics)
- Grafana (dashboards)

### Database Schema

```
users
├── companies
│   └── condos
│       ├── buildings
│       │   └── entrances
│       │       └── units
│       └── residents (many-to-many with users)
└── invites
    refresh_tokens
    password_reset_tokens
    email_verification_tokens
```

---

## 📚 API Documentation

### Authentication

```bash
# Register
POST /api/v1/auth/register
Body: { email, password, first_name, last_name }

# Login
POST /api/v1/auth/login
Body: { email, password }
Response: { access_token, refresh_token, expires_in }

# Refresh Token
POST /api/v1/auth/refresh
Body: { refresh_token }

# Logout
POST /api/v1/auth/logout
Body: { refresh_token }
```

### Companies (CRUD)

```bash
# List
GET /api/v1/companies?page=1&limit=20
Headers: Authorization: Bearer <token>

# Create
POST /api/v1/companies
Body: { name, email, phone, address }

# Get by ID
GET /api/v1/companies/:id

# Update
PATCH /api/v1/companies/:id
Body: { name?, email?, phone? }

# Delete (soft)
DELETE /api/v1/companies/:id
```

### Invites

```bash
# Generate Invite
POST /api/v1/invites
Body: { email, unit_id, role, expires_in_days? }

# Validate Invite
GET /api/v1/invites/validate/:token

# Accept Invite
POST /api/v1/invites/accept
Body: { token, password?, first_name?, last_name? }

# List Invites
GET /api/v1/invites?status=pending&page=1
```

### Password Reset

```bash
# Request Reset
POST /api/v1/password-reset/request
Body: { email }

# Validate Token
GET /api/v1/password-reset/validate/:token

# Reset Password
POST /api/v1/password-reset/reset
Body: { token, new_password }
```

### Email Verification

```bash
# Verify Email
POST /api/v1/email-verification/verify
Body: { token }

# Resend Verification
POST /api/v1/email-verification/resend
Headers: Authorization: Bearer <token>

# Check Status
GET /api/v1/email-verification/status
Headers: Authorization: Bearer <token>
```

### Monitoring

```bash
# Health Check
GET /health
Response: { status: "ok", checks: {...} }

# Liveness Probe
GET /health/liveness

# Readiness Probe
GET /health/readiness

# Prometheus Metrics
GET /metrics
```

**Full API documentation:** See [API_DOCS.md](API_DOCS.md)

---

## 👨‍💻 Development

### Setup

```bash
# Install dependencies
npm install

# Setup database
creatdb servai_dev
npm run migrate

# Run tests
npm test
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
```

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/servai_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_min_32_chars

# Email (optional for dev)
EMAIL_API_KEY=sendgrid_api_key
EMAIL_FROM=noreply@servai.app

# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:5173
```

### Database Migrations

```bash
# Create migration
cp backend/src/db/migrations/000_template.sql backend/src/db/migrations/011_your_migration.sql

# Edit migration file
vim backend/src/db/migrations/011_your_migration.sql

# Run migration
npm run migrate

# Verify
psql servai_dev -c "SELECT * FROM schema_migrations;"
```

---

## 🚀 Production Deployment

### Requirements

- **Server:** 4 vCPU, 8GB RAM minimum
- **Database:** PostgreSQL 14+ (managed service recommended)
- **Cache:** Redis 7+ (managed service recommended)
- **Node.js:** v18+ LTS
- **Domain:** SSL/TLS certificate

### Deployment Guide

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

### Quick Deploy

```bash
# 1. Clone and build
git clone https://github.com/bgrusnak/servAI.git
cd servAI/backend
npm ci --production
npm run build

# 2. Setup environment
cp .env.production .env
# Edit .env with production values

# 3. Run migrations
npm run migrate

# 4. Start with PM2
pm2 start ecosystem.config.js --env production

# 5. Configure Nginx reverse proxy
# (See DEPLOYMENT_GUIDE.md)
```

---

## 📊 Performance

### Benchmarks (Single Server)

| Endpoint | RPS | P95 Latency | P99 Latency |
|----------|-----|-------------|-------------|
| `/health` | 2000+ | <50ms | <100ms |
| Login | 500+ | <200ms | <500ms |
| CRUD (GET) | 1000+ | <100ms | <200ms |
| CRUD (POST) | 500+ | <200ms | <500ms |

**Load Testing Guide:** See [LOAD_TESTING_GUIDE.md](LOAD_TESTING_GUIDE.md)

---

## 🔒 Security

### Audit Results

**External Audit Score:** **9.3/10** (Excellent)  
**Security Score:** **9.5/10** (Excellent)  
**Status:** **APPROVED FOR PRODUCTION** ✅

See [EXTERNAL_AUDIT_REPORT.md](EXTERNAL_AUDIT_REPORT.md) for full audit.

### Security Features

- ✅ OWASP Top 10 compliance
- ✅ Rate limiting (Redis-backed)
- ✅ Secure password hashing (bcrypt)
- ✅ JWT with refresh tokens
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CSRF protection (stateless API)
- ✅ Secure token generation (crypto)
- ✅ Row-level locking
- ✅ Transaction safety

### Reporting Security Issues

Email: [security@servai.app](mailto:security@servai.app)

---

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# Watch mode
npm run test:watch
```

### Test Coverage

```
Statements   : 70.2%
Branches     : 65.8%
Functions    : 68.5%
Lines        : 72.1%
```

**Target:** 80%+ coverage

---

## 📝 Documentation

### Available Docs

- **[API Documentation](API_DOCS.md)** - Complete API reference
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Production deployment
- **[Runbook](RUNBOOK.md)** - Operations and troubleshooting
- **[Load Testing](LOAD_TESTING_GUIDE.md)** - Performance testing
- **[Security Audit](EXTERNAL_AUDIT_REPORT.md)** - Independent audit report
- **[Changelog](CHANGELOG.md)** - Version history
- **[Testing Guide](TESTING.md)** - Test strategy and coverage

---

## 👥 Team

### Roles

| Role | Permissions |
|------|-------------|
| **super_admin** | Full system access |
| **company_admin** | Manage company and all condos |
| **condo_manager** | Manage specific condo |
| **owner** | Manage owned units |
| **tenant** | View only access |

---

## 🛠️ Maintenance

### Daily Tasks
- Monitor error rates in Grafana
- Check application logs
- Verify backup completion

### Weekly Tasks
- Review security alerts
- Check disk space
- Review slow queries
- Update dependencies (security)

### Monthly Tasks
- Security audit
- Performance review
- Backup restoration test
- Capacity planning

---

## 📞 Support

**Documentation:** https://docs.servai.app  
**Status Page:** https://status.servai.app  
**Email:** [support@servai.app](mailto:support@servai.app)  
**Emergency:** [oncall@servai.app](mailto:oncall@servai.app)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## ⭐ Acknowledgments

- Express.js team
- PostgreSQL community
- Redis team
- All open-source contributors

---

**Version:** 0.3.2  
**Status:** Production Ready 🚀  
**Last Updated:** January 6, 2026

---

**Made with ❤️ by the servAI Team**
