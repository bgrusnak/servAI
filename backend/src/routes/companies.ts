import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const companiesRouter = Router();

// All routes require authentication
companiesRouter.use(authenticate);

// Placeholder routes
companiesRouter.get('/', requireRole('super_admin'), (req, res) => {
  res.status(501).json({ message: 'List companies - to be implemented' });
});

companiesRouter.post('/', requireRole('super_admin'), (req, res) => {
  res.status(501).json({ message: 'Create company - to be implemented' });
});

companiesRouter.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Get company - to be implemented' });
});

companiesRouter.patch('/:id', (req, res) => {
  res.status(501).json({ message: 'Update company - to be implemented' });
});

export { companiesRouter };
