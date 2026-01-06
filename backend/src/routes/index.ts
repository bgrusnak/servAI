import { Router } from 'express';
import { authRouter } from './auth';

const apiRouter = Router();

// Auth routes
apiRouter.use('/auth', authRouter);

// Placeholder routes (to be implemented)
apiRouter.get('/companies', (req, res) => {
  res.status(501).json({ message: 'Companies endpoint - to be implemented' });
});

apiRouter.get('/condos', (req, res) => {
  res.status(501).json({ message: 'Condos endpoint - to be implemented' });
});

apiRouter.get('/units', (req, res) => {
  res.status(501).json({ message: 'Units endpoint - to be implemented' });
});

apiRouter.get('/users/me', (req, res) => {
  res.status(501).json({ message: 'User profile endpoint - to be implemented' });
});

export { apiRouter };
