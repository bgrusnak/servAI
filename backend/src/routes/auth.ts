import { Router } from 'express';

const authRouter = Router();

// Placeholder for auth routes
authRouter.post('/register', (req, res) => {
  res.status(501).json({ message: 'Registration endpoint - to be implemented' });
});

authRouter.post('/login', (req, res) => {
  res.status(501).json({ message: 'Login endpoint - to be implemented' });
});

authRouter.post('/refresh', (req, res) => {
  res.status(501).json({ message: 'Token refresh endpoint - to be implemented' });
});

export { authRouter };
