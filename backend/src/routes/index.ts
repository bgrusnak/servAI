import { Router } from 'express';
import { authRouter } from './auth';
import { companiesRouter } from './companies';
import { condosRouter } from './condos';
import { unitsRouter } from './units';
import { usersRouter } from './users';

const apiRouter = Router();

apiRouter.get('/', (req, res) => {
  res.json({
    name: 'servAI API',
    version: '1.0.0',
    status: 'running',
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/condos', condosRouter);
apiRouter.use('/units', unitsRouter);
apiRouter.use('/users', usersRouter);

export { apiRouter };
