# Changelog

All notable changes to servAI project will be documented in this file.

## [0.2.0] - 2026-01-06

### Added

**Authentication & Authorization:**
- ✅ User registration endpoint with email validation
- ✅ User login endpoint with password verification
- ✅ Token refresh endpoint with automatic rotation
- ✅ Logout (single device) endpoint
- ✅ Logout all devices endpoint
- ✅ Get current user profile endpoint
- ✅ Password strength validation (configurable requirements)
- ✅ Access token revocation checking (Redis blacklist)
- ✅ Per-user refresh token rate limiting
- ✅ User service with CRUD operations
- ✅ Telegram account linking/unlinking

**Companies Management:**
- ✅ List companies (filtered by user roles)
- ✅ Get company by ID
- ✅ Create company (system admin)
- ✅ Update company (company admin)
- ✅ Delete company (soft delete, system admin)
- ✅ Automatic role assignment (creator becomes company_admin)
- ✅ INN uniqueness validation
- ✅ Role-based access control

**Condos Management:**
- ✅ List condos (filtered by user access)
- ✅ Get condo by ID
- ✅ Create condo (company admin)
- ✅ Update condo (company/condo admin)
- ✅ Delete condo (soft delete, company admin)
- ✅ Company filter support
- ✅ Access control inheritance from company

**Units Management:**
- ✅ List units (by condo with pagination)
- ✅ Get unit by ID
- ✅ Create unit (company/condo admin)
- ✅ Update unit (company/condo admin)
- ✅ Delete unit (soft delete, company/condo admin)
- ✅ Duplicate number validation per condo
- ✅ Unit type validation
- ✅ Full owner information support

**Services Layer:**
- ✅ CompanyService with business logic
- ✅ CondoService with access control
- ✅ UnitService with validation
- ✅ UserService with Telegram integration
- ✅ AuthService with token management

**Infrastructure:**
- ✅ Role-based access control helpers
- ✅ Pagination support (20/100 default/max)
- ✅ Transaction support where needed
- ✅ Comprehensive logging
- ✅ Error sanitization

### Changed

**Database:**
- ⚡ Merged all 5 migrations into single `001_init_complete_schema.sql`
- ⚡ Removed SERIAL, using UUID for all primary keys
- ⚡ Soft delete (`deleted_at`) included from the start
- ⚡ Created 18 `*_active` views for easy querying
- ⚡ All indexes optimized with `WHERE deleted_at IS NULL`

**Configuration:**
- ⚡ All constants now configurable via environment variables
- ⚡ Password requirements configurable
- ⚡ Cache TTLs configurable
- ⚡ Cleanup batch size configurable
- ⚡ Rate limits configurable

**Worker:**
- ⚡ Cleanup jobs now use batching (1000 records per batch)
- ⚡ Jobs scheduled automatically on startup
- ⚡ Small delays between batches to reduce load
- ⚡ Proper transaction handling

**Auth Middleware:**
- ⚡ Added token revocation check (Redis + DB)
- ⚡ Improved type safety
- ⚡ Better error messages

### Fixed

**Critical:**
- 🐛 Auth routes now properly connected to API router
- 🐛 Migration 004/005 conflict resolved (merged to 001)
- 🐛 Access tokens now check revocation status
- 🐛 Soft delete properly handled in all queries

**Security:**
- 🔒 Password validation enforced on registration
- 🔒 Token revocation working correctly
- 🔒 Rate limiting on refresh endpoint
- 🔒 Type assertions properly validated

**Performance:**
- ⚡ Cleanup jobs no longer lock tables
- ⚡ Batch processing for large deletions
- ⚡ Redis caching for revoked tokens

### Security

- Added password strength validation with configurable rules
- Implemented access token revocation checking
- Added per-user refresh token rate limiting
- Role-based access control on all CRUD endpoints
- Audit logging for all operations

---

## [0.1.0] - 2026-01-05

### Added

**Database:**
- ✅ Complete PostgreSQL schema (50+ tables)
- ✅ Soft delete on all tables
- ✅ Companies, condos, buildings, entrances, units
- ✅ Users, roles, residents
- ✅ Invites system
- ✅ Meters and readings
- ✅ Tickets with categories and comments
- ✅ Notifications
- ✅ Telegram messages history
- ✅ Audit logs
- ✅ Files storage
- ✅ Refresh tokens with rotation

**Infrastructure:**
- ✅ Docker development setup
- ✅ Docker production setup (multi-stage)
- ✅ PostgreSQL with connection pooling
- ✅ Redis for caching and rate limiting
- ✅ BullMQ worker for background jobs
- ✅ Migration system with advisory locks
- ✅ Connection leak detection

**Middleware:**
- ✅ JWT authentication
- ✅ Redis-backed rate limiting
- ✅ Error handling with sanitization
- ✅ Request logging
- ✅ CORS configuration

**Health Checks:**
- ✅ `/health` - Liveness probe
- ✅ `/ready` - Readiness probe (DB, Redis, migrations)
- ✅ `/health/integrations` - External services check

**Utils:**
- ✅ Winston structured logging
- ✅ Redis client with graceful degradation
- ✅ Config management
- ✅ Constants management

**Documentation:**
- ✅ Comprehensive README
- ✅ Architecture overview
- ✅ Deployment guide
- ✅ Troubleshooting section
- ✅ Security checklist

---

## Upcoming Features

**v0.3.0 - Residents & Invites:**
- 🔄 Invite generation endpoints
- 🔄 Invite acceptance flow
- 🔄 Resident management
- 🔄 Unit assignment

**v0.4.0 - Tickets System:**
- 🔄 Create ticket
- 🔄 List tickets with filters
- 🔄 Update ticket status
- 🔄 Add comments
- 🔄 File attachments
- 🔄 Notifications

**v0.5.0 - Telegram Bot:**
- 🔄 Bot setup and webhooks
- 🔄 User authentication via Telegram
- 🔄 NLU with Perplexity Sonar
- 🔄 Context management
- 🔄 Message history

**v0.6.0 - Meter Readings:**
- 🔄 Submit readings
- 🔄 Photo upload
- 🔄 Verification workflow
- 🔄 History and statistics

**v0.7.0 - Frontend:**
- 🔄 Vue 3 + Quasar setup
- 🔄 Admin dashboard
- 🔄 Authentication flow
- 🔄 CRUD interfaces

**v0.8.0 - Billing:**
- 🔄 Stripe integration
- 🔄 Invoice generation
- 🔄 Payment processing
- 🔄 Subscription management

**v1.0.0 - Production Release:**
- 🔄 Automated tests (unit, integration)
- 🔄 OpenAPI documentation
- 🔄 Prometheus metrics
- 🔄 Load testing
- 🔄 Security audit
- 🔄 Performance optimization
- 🔄 CDN setup
- 🔄 Monitoring and alerting

---

## Legend

- ✅ Completed
- 🔄 In Progress
- ⚡ Improved
- 🐛 Bug Fix
- 🔒 Security
- 📝 Documentation
- 🎨 UI/UX
- ♻️ Refactoring
