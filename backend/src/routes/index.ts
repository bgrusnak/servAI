import { Router } from 'express';
import { authRouter } from './auth';
import { companiesRouter } from './companies';
import { condosRouter } from './condos';
import { unitsRouter } from './units';

const apiRouter = Router();

// Auth routes (public)
apiRouter.use('/auth', authRouter);

// Protected routes (require authentication)
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/condos', condosRouter);
apiRouter.use('/units', unitsRouter);

// Health check for API
apiRouter.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

export { apiRouter };
