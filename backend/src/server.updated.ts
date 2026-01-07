import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AppDataSource } from './db/data-source';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler.middleware';
import { sanitize } from './middleware/validate.middleware';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import vehicleRoutes from './routes/vehicles';
import condoRoutes from './routes/condos';
import unitRoutes from './routes/units';
import residentRoutes from './routes/residents';
import requestRoutes from './routes/requests';
import invoiceRoutes from './routes/invoices';
import notificationRoutes from './routes/notifications';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize input
app.use(sanitize);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 requests for sensitive endpoints
  message: 'Too many attempts, please try again later',
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', strictLimiter);
app.use('/api/v1/auth/register', strictLimiter);

// Health check endpoints
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await AppDataSource.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    });
  }
});

app.get('/ready', async (req, res) => {
  try {
    // Check if app is ready to accept requests
    if (!AppDataSource.isInitialized) {
      throw new Error('Database not initialized');
    }

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/condos', condoRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/residents', residentRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
AppDataSource.initialize()
  .then(() => {
    logger.info('Database connected');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    logger.error('Database connection failed', { error });
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  AppDataSource.destroy()
    .then(() => {
      logger.info('Database connections closed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    });
});

export default app;
