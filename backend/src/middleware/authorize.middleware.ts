import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { Resident } from '../entities/Resident';
import { Unit } from '../entities/Unit';
import { User } from '../entities/User';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const residentRepository = AppDataSource.getRepository(Resident);
const unitRepository = AppDataSource.getRepository(Unit);
const userRepository = AppDataSource.getRepository(User);

export type UserRole = 
  | 'superadmin'
  | 'uk_director'
  | 'accountant'
  | 'complex_admin'
  | 'employee'
  | 'security_guard'
  | 'resident';

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    next();
  };
};

export const canAccessCompany = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role === 'superadmin') return next();
      const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
      if (!companyId) throw new ForbiddenError('Company ID required');
      if (req.user.companyId !== companyId) throw new ForbiddenError('Access denied to this company');
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const canAccessCondo = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role === 'superadmin') return next();
      const condoId = req.params.condoId || req.body.condoId || req.query.condoId;
      if (!condoId) throw new ForbiddenError('Condo ID required');
      
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        const condo = await AppDataSource.getRepository('Condo').findOne({ where: { id: condoId } });
        if (!condo) throw new NotFoundError('Condo');
        if (condo.companyId !== req.user.companyId) throw new ForbiddenError('Access denied to this condo');
        return next();
      }
      
      if (req.user.condoId !== condoId) throw new ForbiddenError('Access denied to this condo');
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const canAccessUnit = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role === 'superadmin') return next();
      const unitId = req.params.unitId || req.body.unitId || req.query.unitId;
      if (!unitId) throw new ForbiddenError('Unit ID required');
      
      const unit = await unitRepository.findOne({ where: { id: unitId }, relations: ['condo'] });
      if (!unit) throw new NotFoundError('Unit');
      
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        if (unit.condo.companyId !== req.user.companyId) throw new ForbiddenError('Access denied to this unit');
        return next();
      }
      
      if (req.user.role === 'complex_admin' || req.user.role === 'employee') {
        if (unit.condoId !== req.user.condoId) throw new ForbiddenError('Access denied to this unit');
        return next();
      }
      
      if (req.user.role === 'resident') {
        const resident = await residentRepository.findOne({ where: { userId: req.user.id, unitId } });
        if (!resident) throw new ForbiddenError('Access denied to this unit');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const isSecurityGuard = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user.role !== 'security_guard' && req.user.role !== 'superadmin') {
      throw new ForbiddenError('Only security guards can access this');
    }
    next();
  };
};

export const canAccessTask = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role === 'superadmin') return next();
      const taskId = req.params.taskId || req.params.id;
      if (!taskId) throw new ForbiddenError('Task ID required');
      
      const task = await AppDataSource.getRepository('Ticket').findOne({
        where: { id: taskId },
        relations: ['unit', 'unit.condo'],
      });
      if (!task) throw new NotFoundError('Task');
      
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        if (task.unit.condo.companyId !== req.user.companyId) throw new ForbiddenError('Access denied to this task');
        return next();
      }
      
      if (req.user.role === 'complex_admin') {
        if (task.unit.condoId !== req.user.condoId) throw new ForbiddenError('Access denied to this task');
        return next();
      }
      
      if (req.user.role === 'employee') {
        if (task.assignedTo !== req.user.id) throw new ForbiddenError('Access denied to this task');
        return next();
      }
      
      if (req.user.role === 'resident') {
        const resident = await residentRepository.findOne({ where: { userId: req.user.id, unitId: task.unitId } });
        if (!resident) throw new ForbiddenError('Access denied to this task');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const canAccessFinances = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role === 'superadmin') return next();
      if (req.user.role !== 'uk_director' && req.user.role !== 'accountant') {
        throw new ForbiddenError('Access denied to financial data');
      }
      
      const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
      if (companyId && companyId !== req.user.companyId) {
        throw new ForbiddenError('Access denied to this company finances');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default {
  authorize,
  canAccessCompany,
  canAccessCondo,
  canAccessUnit,
  isSecurityGuard,
  canAccessTask,
  canAccessFinances,
};
