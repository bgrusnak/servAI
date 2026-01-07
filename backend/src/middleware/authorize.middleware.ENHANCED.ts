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
  | 'superadmin'        // Полный доступ ко всему
  | 'uk_director'       // Доступ ко всем ЖК своей УК
  | 'accountant'        // Доступ к финансам своей УК
  | 'complex_admin'     // Доступ к своему ЖК
  | 'employee'          // Доступ к своим задачам
  | 'security_guard'    // Доступ к проверке пропусков
  | 'resident';         // Доступ к своей квартире

/**
 * ✅ РОЛЬ-БАЗИРОВАННАЯ АВТОРИЗАЦИЯ
 */
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

/**
 * ✅ MULTI-TENANT: ИЗОЛЯЦИЯ ПО КОМПАНИИ (УК)
 * Пользователь видит только данные своей УК
 */
export const canAccessCompany = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Superadmin видит всё
      if (req.user.role === 'superadmin') {
        return next();
      }

      const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
      
      if (!companyId) {
        throw new ForbiddenError('Company ID required');
      }

      // Проверка что пользователь из этой УК
      if (req.user.companyId !== companyId) {
        throw new ForbiddenError('Access denied to this company');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * ✅ MULTI-TENANT: ИЗОЛЯЦИЯ ПО ЖК
 * Пользователь видит только данные своего ЖК
 */
export const canAccessCondo = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Superadmin видит всё
      if (req.user.role === 'superadmin') {
        return next();
      }

      const condoId = req.params.condoId || req.body.condoId || req.query.condoId;
      
      if (!condoId) {
        throw new ForbiddenError('Condo ID required');
      }

      // UK Director видит все ЖК своей УК
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        const condo = await AppDataSource.getRepository('Condo').findOne({
          where: { id: condoId }
        });
        
        if (!condo) {
          throw new NotFoundError('Condo');
        }
        
        if (condo.companyId !== req.user.companyId) {
          throw new ForbiddenError('Access denied to this condo');
        }
        
        return next();
      }

      // Complex Admin / Employee / Security Guard видят только свой ЖК
      if (req.user.condoId !== condoId) {
        throw new ForbiddenError('Access denied to this condo');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * ✅ ИЗОЛЯЦИЯ ПО КВАРТИРЕ
 * Resident видит только свою квартиру
 */
export const canAccessUnit = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Superadmin видит всё
      if (req.user.role === 'superadmin') {
        return next();
      }

      const unitId = req.params.unitId || req.body.unitId || req.query.unitId;
      
      if (!unitId) {
        throw new ForbiddenError('Unit ID required');
      }

      const unit = await unitRepository.findOne({
        where: { id: unitId },
        relations: ['condo'],
      });

      if (!unit) {
        throw new NotFoundError('Unit');
      }

      // UK Director / Accountant видят все квартиры своей УК
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        if (unit.condo.companyId !== req.user.companyId) {
          throw new ForbiddenError('Access denied to this unit');
        }
        return next();
      }

      // Complex Admin / Employee видят все квартиры своего ЖК
      if (req.user.role === 'complex_admin' || req.user.role === 'employee') {
        if (unit.condoId !== req.user.condoId) {
          throw new ForbiddenError('Access denied to this unit');
        }
        return next();
      }

      // Resident видит только свою квартиру
      if (req.user.role === 'resident') {
        const resident = await residentRepository.findOne({
          where: {
            userId: req.user.id,
            unitId: unitId,
          },
        });

        if (!resident) {
          throw new ForbiddenError('Access denied to this unit');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * ✅ ПРОВЕРКА ЧТО ПОЛЬЗОВАТЕЛЬ - ОХРАННИК
 */
export const isSecurityGuard = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user.role !== 'security_guard' && req.user.role !== 'superadmin') {
      throw new ForbiddenError('Only security guards can access this');
    }
    next();
  };
};

/**
 * ✅ ИЗОЛЯЦИЯ ЗАДАЧ СОТРУДНИКА
 * Employee видит только свои задачи
 */
export const canAccessTask = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Superadmin видит всё
      if (req.user.role === 'superadmin') {
        return next();
      }

      const taskId = req.params.taskId || req.params.id;
      
      if (!taskId) {
        throw new ForbiddenError('Task ID required');
      }

      const task = await AppDataSource.getRepository('Ticket').findOne({
        where: { id: taskId },
        relations: ['unit', 'unit.condo'],
      });

      if (!task) {
        throw new NotFoundError('Task');
      }

      // UK Director / Accountant видят все задачи своей УК
      if (req.user.role === 'uk_director' || req.user.role === 'accountant') {
        if (task.unit.condo.companyId !== req.user.companyId) {
          throw new ForbiddenError('Access denied to this task');
        }
        return next();
      }

      // Complex Admin видит все задачи своего ЖК
      if (req.user.role === 'complex_admin') {
        if (task.unit.condoId !== req.user.condoId) {
          throw new ForbiddenError('Access denied to this task');
        }
        return next();
      }

      // Employee видит только свои задачи
      if (req.user.role === 'employee') {
        if (task.assignedTo !== req.user.id) {
          throw new ForbiddenError('Access denied to this task');
        }
        return next();
      }

      // Resident видит задачи своей квартиры
      if (req.user.role === 'resident') {
        const resident = await residentRepository.findOne({
          where: {
            userId: req.user.id,
            unitId: task.unitId,
          },
        });

        if (!resident) {
          throw new ForbiddenError('Access denied to this task');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * ✅ ИЗОЛЯЦИЯ ФИНАНСОВ ПО УК
 * Бухгалтера видят только финансы своей УК
 */
export const canAccessFinances = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Superadmin видит всё
      if (req.user.role === 'superadmin') {
        return next();
      }

      // Только UK Director и Accountant имеют доступ к финансам
      if (req.user.role !== 'uk_director' && req.user.role !== 'accountant') {
        throw new ForbiddenError('Access denied to financial data');
      }

      // Проверка что запрашиваются данные своей УК
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
