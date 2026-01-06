import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const condosRouter = Router();

// All routes require authentication
condosRouter.use(authenticate);

// Placeholder routes
condosRouter.get('/', (req, res) => {
  res.status(501).json({ message: 'List condos - to be implemented' });
});

condosRouter.post('/', (req, res) => {
  res.status(501).json({ message: 'Create condo - to be implemented' });
});

condosRouter.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Get condo - to be implemented' });
});

condosRouter.patch('/:id', (req, res) => {
  res.status(501).json({ message: 'Update condo - to be implemented' });
});

export { condosRouter };
