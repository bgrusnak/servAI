import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const unitsRouter = Router();

// All routes require authentication
unitsRouter.use(authenticate);

// Placeholder routes
unitsRouter.get('/', (req, res) => {
  res.status(501).json({ message: 'List units - to be implemented' });
});

unitsRouter.post('/import', (req, res) => {
  res.status(501).json({ message: 'Import units from Excel - to be implemented' });
});

unitsRouter.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Get unit - to be implemented' });
});

unitsRouter.patch('/:id', (req, res) => {
  res.status(501).json({ message: 'Update unit - to be implemented' });
});

export { unitsRouter };
