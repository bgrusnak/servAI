import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/data-source';
import { Resident } from '../entities/Resident';
import { User } from '../entities/User';
import { Unit } from '../entities/Unit';
import { Condo } from '../entities/Condo';
import { Company } from '../entities/Company';
import { logger } from '../utils/logger';

const residentRepository = AppDataSource.getRepository(Resident);
const unitRepository = AppDataSource.getRepository(Unit);
const condoRepository = AppDataSource.getRepository(Condo);
const companyRepository = AppDataSource.getRepository(Company);

/**
 * Check if user has one of the allowed roles
 */
export function authorize(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user as User;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No user in request',
        });
      }

      // Check if user has one of the allowed roles
      if (!allowedRoles.includes(user.role)) {
        logger.warn('Authorization failed', {
          userId: user.id,
          userRole: user.role,
          allowedRoles,
          path: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Check if user can access specific unit
 * Super admin and complex admin can access all units in their scope
 */
export function canAccessUnit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user as User;
      const unitId = req.params.unitId || req.body.unitId;

      if (!unitId) {
        return res.status(400).json({
          success: false,
          error: 'unitId is required',
        });
      }

      // Super admin can access everything
      if (user.role === 'super_admin') {
        return next();
      }

      // Get unit with relations
      const unit = await unitRepository.findOne({
        where: { id: unitId },
        relations: ['condo', 'condo.company'],
      });

      if (!unit) {
        return res.status(404).json({
          success: false,
          error: 'Unit not found',
        });
      }

      // UK director can access units in their company
      if (user.role === 'uk_director' && user.companyId === unit.condo.companyId) {
        return next();
      }

      // Complex admin can access units in their condo
      if (user.role === 'complex_admin' && user.condoId === unit.condoId) {
        return next();
      }

      // Check if user is resident of this unit
      const resident = await residentRepository.findOne({
        where: { userId: user.id, unitId },
      });

      if (resident) {
        return next();
      }

      // Access denied
      logger.warn('Unit access denied', {
        userId: user.id,
        userRole: user.role,
        unitId,
        condoId: unit.condoId,
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied to this unit',
      });
    } catch (error) {
      logger.error('canAccessUnit middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Check if user can access specific condo
 */
export function canAccessCondo() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user as User;
      const condoId = req.params.condoId || req.params.id || req.body.condoId;

      if (!condoId) {
        return res.status(400).json({
          success: false,
          error: 'condoId is required',
        });
      }

      // Super admin can access everything
      if (user.role === 'super_admin') {
        return next();
      }

      // Get condo
      const condo = await condoRepository.findOne({
        where: { id: condoId },
      });

      if (!condo) {
        return res.status(404).json({
          success: false,
          error: 'Condo not found',
        });
      }

      // UK director can access condos in their company
      if (user.role === 'uk_director' && user.companyId === condo.companyId) {
        return next();
      }

      // Complex admin can access their condo
      if (user.role === 'complex_admin' && user.condoId === condoId) {
        return next();
      }

      // Access denied
      logger.warn('Condo access denied', {
        userId: user.id,
        userRole: user.role,
        condoId,
        companyId: condo.companyId,
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied to this condo',
      });
    } catch (error) {
      logger.error('canAccessCondo middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Check if user can access specific company
 */
export function canAccessCompany() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user as User;
      const companyId = req.params.companyId || req.params.id || req.body.companyId;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: 'companyId is required',
        });
      }

      // Super admin can access everything
      if (user.role === 'super_admin') {
        return next();
      }

      // UK director can access their company
      if (user.role === 'uk_director' && user.companyId === companyId) {
        return next();
      }

      // Access denied
      logger.warn('Company access denied', {
        userId: user.id,
        userRole: user.role,
        companyId,
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied to this company',
      });
    } catch (error) {
      logger.error('canAccessCompany middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Check if user is security guard
 */
export function isSecurityGuard() {
  return authorize('security_guard', 'complex_admin', 'uk_director', 'super_admin');
}
