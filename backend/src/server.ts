import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import slowDown from 'express-slow-down';
import crypto from 'crypto';
import { config } from './config';
import { logger, securityLogger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metrics'; // Updated import
import { authenticateToken } from './middleware/auth';
import { telegramService } from './services/telegram.service';
import { websocketService } from './services/websocket.service';
import { AppDataSource } from './db/data-source';
import { uploadService } from './services/upload.service';

// Import routes
import authRoutes from './routes/auth';
import companyRoutes from './routes/companies';
import condoRoutes from './routes/condos';
import buildingRoutes from './routes/buildings';
import entranceRoutes from './routes/entrances';
import unitRoutes from './routes/units';
import inviteRoutes from './routes/invites';
import residentRoutes from './routes/residents';
import passwordResetRoutes from './routes/password-reset';
import emailVerificationRoutes from './routes/email-verification';
import monitoringRoutes from './routes/monitoring';
import telegramRoutes from './routes/telegram';

// New routes
import metersRoutes from './routes/meters.routes';
import invoicesRoutes from './routes/invoices.routes';
import pollsRoutes from './routes/polls.routes';
import ticketsRoutes from './routes/tickets.routes';
import stripeRoutes from './routes/stripe.routes';
import uploadRoutes from './routes/upload.routes';

const app = express();
const httpServer = createServer(app);

/**
 * CRITICAL: Custom CSRF protection (stateless, XSS-resistant)
 * Uses HMAC-signed tokens instead of cookies
 */
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_TOKEN_EXPIRY = 3600000; // 1 hour

if (!process.env.CSRF_SECRET) {
  logger.warn(
    'CSRF_SECRET not set in environment. Using random secret. ' +
    'Set CSRF_SECRET in .env for production (generate with: openssl rand -hex 32)'
  );
}

/**
 * Generate CSRF token with HMAC signature
 * Format: {random}.{timestamp}.{signature}
 */
function generateCSRFToken(): string {
  const random = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${random}.${timestamp}`;
  
  const signature = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(data)
    .digest('hex');
  
  return `${data}.${signature}`;
}

/**
 * Verify CSRF token signature and expiry
 */
function verifyCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  const [random, timestamp, signature] = parts;
  
  // Verify format
  if (!/^[a-f0-9]{32}$/.test(random) || !/^[0-9]+$/.test(timestamp)) {
    return false;
  }
  
  // Verify expiry
  const tokenTime = parseInt(timestamp, 10);
  if (Date.now() - tokenTime > CSRF_TOKEN_EXPIRY) {
    return false;
  }
  
  // Verify signature
  const data = `${random}.${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(data)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Custom CSRF middleware
 */
function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Get token from header
  const token = req.headers['x-csrf-token'] as string;
  
  if (!verifyCSRFToken(token)) {
    securityLogger.suspiciousActivity(
      'CSRF token validation failed',
      (req as any).user?.id,
      req.ip || req.socket.remoteAddress || 'unknown',
      {
        path: req.path,
        method: req.method,
        hasToken: !!token,
        tokenValid: false,
      }
    );
    
    return res.status(403).json({
      error: 'Invalid or expired CSRF token',
      code: 'CSRF_TOKEN_INVALID',
    });
  }
  
  next();
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
  })
);

// Cookie parser
app.use(cookieParser());

// Rate limiting for large bodies (DoS prevention)
const bodyRateLimiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 10, // Allow 10 requests per minute at full speed
  delayMs: 500, // Add 500ms delay per request after that
  maxDelayMs: 5000, // Max 5 second delay
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip || 'unknown',
});

// CRITICAL: Raw body for Stripe webhooks BEFORE json parser!
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));

// Request parsing with rate limiting for large bodies
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  // If body > 1MB, apply rate limiting
  if (contentLength > 1024 * 1024) {
    return bodyRateLimiter(req, res, next);
  }

  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CRITICAL: Protect uploads directory with authentication
const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

app.use(
  '/uploads',
  authenticateToken,
  async (req: any, res, next) => {
    try {
      // Extract file key from URL
      const fileKey = req.path.substring(1); // Remove leading '/'

      if (!fileKey) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      // Verify user has access to this file
      const hasAccess = await uploadService.verifyDocumentAccess(
        fileKey,
        req.user.id,
        req.user.roles
      );

      if (!hasAccess) {
        securityLogger.accessDenied(
          req.user.id,
          `file:${fileKey}`,
          req.ip || 'unknown'
        );
        return res.status(403).json({ error: 'Access denied' });
      }

      // User has access, serve the file
      next();
    } catch (error: any) {
      logger.error('Error checking file access', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  express.static(uploadsDir)
);

// CRITICAL: CSRF token endpoint (public, rate limited)
const csrfTokenRateLimiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 20, // Allow 20 requests per minute
  delayMs: 100,
  maxDelayMs: 2000,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip || 'unknown',
});

app.get('/api/v1/auth/csrf-token', csrfTokenRateLimiter, (req, res) => {
  const token = generateCSRFToken();
  
  logger.debug('CSRF token generated', {
    ip: req.ip || req.socket.remoteAddress,
  });
  
  res.json({ csrfToken: token });
});

// Apply CSRF protection to all state-changing requests
app.use((req, res, next) => {
  // Skip CSRF for:
  // - Safe methods (GET, HEAD, OPTIONS)
  // - Stripe webhooks (signature verification)
  // - Monitoring endpoints
  // - CSRF token endpoint itself
  const skipPaths = [
    '/api/v1/stripe/webhook',
    '/health',
    '/metrics',
    '/ping',
    '/api/v1/auth/csrf-token',
  ];

  if (skipPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // CRITICAL: Login and Register now REQUIRE CSRF token!
  // All POST/PUT/PATCH/DELETE requests require CSRF
  // Clients MUST:
  // 1. GET /api/v1/auth/csrf-token
  // 2. Store token in memory (NOT localStorage)
  // 3. Include token in X-CSRF-Token header for all mutations

  csrfProtection(req, res, next);
});

// Metrics collection (before request logging for accurate timing)
app.use(metricsMiddleware);

// Request logging
app.use(requestLogger);

// Monitoring endpoints (no /api prefix, no auth)
app.use('/', monitoringRoutes);

// API routes (v1)
const apiV1Router = express.Router();

// Auth & User Management
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/password-reset', passwordResetRoutes);
apiV1Router.use('/email-verification', emailVerificationRoutes);

// Organizations & Structure
apiV1Router.use('/companies', companyRoutes);
apiV1Router.use('/condos', condoRoutes);
apiV1Router.use('/buildings', buildingRoutes);
apiV1Router.use('/entrances', entranceRoutes);
apiV1Router.use('/units', unitRoutes);
apiV1Router.use('/invites', inviteRoutes);
apiV1Router.use('/residents', residentRoutes);

// Business Logic
apiV1Router.use('/', metersRoutes); // /meters, /units/:id/meters
apiV1Router.use('/', invoicesRoutes); // /invoices, /units/:id/invoices
apiV1Router.use('/', pollsRoutes); // /polls
apiV1Router.use('/', ticketsRoutes); // /tickets

// Integrations
apiV1Router.use('/', stripeRoutes); // /stripe/payment-intent, /stripe/webhook
apiV1Router.use('/', uploadRoutes); // /upload/document, /upload/meter-photo
apiV1Router.use('/telegram', telegramRoutes);

app.use('/api/v1', apiV1Router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize services
let servicesInitialized = false;

async function initializeServices() {
  if (servicesInitialized) return;

  try {
    // Initialize TypeORM
    await AppDataSource.initialize();
    logger.info('TypeORM DataSource initialized');

    // Initialize Telegram bot
    await telegramService.initialize();
    logger.info('Telegram bot initialized');

    // Initialize WebSocket server
    websocketService.initialize(httpServer);
    logger.info('WebSocket server initialized');

    servicesInitialized = true;
  } catch (error: any) {
    logger.error('Failed to initialize services:', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully');

  try {
    await telegramService.shutdown();
    logger.info('Telegram bot stopped');

    await AppDataSource.destroy();
    logger.info('Database connections closed');
  } catch (error: any) {
    logger.error('Error during shutdown:', { error: error.message });
  }

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.warn('Forcing shutdown');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
if (require.main === module) {
  httpServer.listen(config.port, async () => {
    logger.info(`servAI Backend v${require('../package.json').version}`);
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Metrics: http://localhost:${config.port}/metrics (Prometheus format)`);
    logger.info(`Health: http://localhost:${config.port}/health (detailed)`);
    logger.info(`Health: http://localhost:${config.port}/health/live (liveness)`);
    logger.info(`Health: http://localhost:${config.port}/health/ready (readiness)`);
    logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
    logger.info(`Uploads: ${uploadsDir} (protected)`);
    logger.info(`CSRF: Enabled (Custom HMAC-based tokens, XSS-resistant)`);

    // Initialize services after server starts
    await initializeServices();
  });
}

export { app, httpServer };
