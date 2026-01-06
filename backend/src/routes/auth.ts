import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const authRouter = Router();

// Apply strict rate limiting to auth endpoints
authRouter.use(authRateLimiter);

// Register - placeholder
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement registration logic
    res.status(501).json({ message: 'Registration endpoint - to be implemented' });
  } catch (error) {
    next(error);
  }
});

// Login - placeholder
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement login logic
    // const { email, password } = req.body;
    // 1. Validate credentials
    // 2. const tokens = await AuthService.createTokenPair(userId, req.ip, req.get('user-agent'));
    // 3. return { accessToken, refreshToken }
    
    res.status(501).json({ message: 'Login endpoint - to be implemented' });
  } catch (error) {
    next(error);
  }
});

// Refresh token
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const tokens = await AuthService.refreshTokens(
      refreshToken,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Logout (revoke current refresh token)
authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.revokeRefreshToken(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Logout all devices (revoke all refresh tokens)
authRouter.post('/logout-all', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const count = await AuthService.revokeAllUserTokens(req.user.id);

    res.json({ 
      message: 'Logged out from all devices',
      revokedTokens: count,
    });
  } catch (error) {
    next(error);
  }
});

export { authRouter };
