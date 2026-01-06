import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const usersRouter = Router();

// All routes require authentication
usersRouter.use(authenticate);

// Placeholder routes
usersRouter.get('/me', (req, res) => {
  res.status(501).json({ message: 'Get current user - to be implemented' });
});

usersRouter.get('/', requireRole('super_admin', 'company_director', 'condo_admin'), (req, res) => {
  res.status(501).json({ message: 'List users - to be implemented' });
});

usersRouter.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Get user - to be implemented' });
});

usersRouter.patch('/:id', (req, res) => {
  res.status(501).json({ message: 'Update user - to be implemented' });
});

export { usersRouter };
