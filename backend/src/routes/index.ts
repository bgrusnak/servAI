import { Router } from 'express';
import { authRouter } from './auth';
import { companiesRouter } from './companies';
import { condosRouter } from './condos';
import { buildingsRouter } from './buildings';
import { entrancesRouter } from './entrances';
import { unitsRouter } from './units';
import { invitesRouter } from './invites';
import { residentsRouter } from './residents';
import vehiclesRouter from './vehicles';

const apiRouter = Router();

// Auth routes (public)
apiRouter.use('/auth', authRouter);

// Protected routes (require authentication)
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/condos', condosRouter);
apiRouter.use('/buildings', buildingsRouter);
apiRouter.use('/entrances', entrancesRouter);
apiRouter.use('/units', unitsRouter);
apiRouter.use('/invites', invitesRouter);
apiRouter.use('/residents', residentsRouter);
apiRouter.use('/vehicles', vehiclesRouter);

// Health check for API
apiRouter.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

export { apiRouter };
