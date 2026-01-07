import 'reflect-metadata';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import path from 'path';
import slowDown from 'express-slow-down';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { authenticateToken } from './middleware/auth.middleware';
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

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: config.cors.credentials, // Important for cookies!
  })
);

// Cookie parser - MUST be before CSRF
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

app.use('/uploads', authenticateToken, async (req: any, res, next) => {
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
      logger.warn('Unauthorized file access attempt', {
        userId: req.user.id,
        fileKey,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // User has access, serve the file
    next();
  } catch (error) {
    logger.error('Error checking file access', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}, express.static(uploadsDir));

// CSRF protection
// NOTE: Using Double Submit Cookie pattern (httpOnly=false)
// This is vulnerable to XSS attacks, but necessary for SPA.
// Mitigation: Strict CSP, XSS prevention in frontend
// Alternative: Use session-based CSRF with httpOnly=true
const csrfProtection = csrf({ 
  cookie: { 
    httpOnly: false, // Must be false for Double Submit Cookie pattern
    sameSite: 'strict',
    secure: config.env === 'production' || config.env === 'staging'
  } 
});

// Apply CSRF to all routes except public ones
app.use((req, res, next) => {
  // Skip CSRF ONLY for:
  // - Stripe webhooks (signature verification)
  // - Monitoring endpoints (public)
  // - CSRF token endpoint (must be accessible)
  const skipPaths = [
    '/api/v1/stripe/webhook',
    '/health',
    '/metrics',
    '/api/v1/auth/csrf-token'
  ];
  
  // CRITICAL: Login and Register now REQUIRE CSRF token!
  // Clients must:
  // 1. GET /api/v1/auth/csrf-token
  // 2. Include token in X-CSRF-Token header
  // 3. POST to /api/v1/auth/login or /api/v1/auth/register
  
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  csrfProtection(req, res, next);
});

// Provide CSRF token endpoint
app.get('/api/v1/auth/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken?.() || '' });
});

// Metrics collection
app.use(metricsMiddleware);

// Request logging
app.use(requestLogger);

// Monitoring endpoints (no /api prefix)
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
apiV1Router.use('/', metersRoutes);         // /meters, /units/:id/meters
apiV1Router.use('/', invoicesRoutes);       // /invoices, /units/:id/invoices
apiV1Router.use('/', pollsRoutes);          // /polls
apiV1Router.use('/', ticketsRoutes);        // /tickets

// Integrations
apiV1Router.use('/', stripeRoutes);         // /stripe/payment-intent, /stripe/webhook
apiV1Router.use('/', uploadRoutes);         // /upload/document, /upload/meter-photo
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
  } catch (error) {
    logger.error('Failed to initialize services:', error);
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
  } catch (error) {
    logger.error('Error during shutdown:', error);
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
    logger.info(`Metrics: http://localhost:${config.port}/metrics`);
    logger.info(`Health: http://localhost:${config.port}/health`);
    logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
    logger.info(`Uploads: ${uploadsDir} (protected)`);
    logger.info(`CSRF: Enabled (Double Submit Cookie pattern)`);
    
    // Initialize services after server starts
    await initializeServices();
  });
}

export { app, httpServer };