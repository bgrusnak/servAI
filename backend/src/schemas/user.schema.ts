import { z } from 'zod';

const userRoles = [
  'super_admin',
  'super_accountant',
  'uk_director',
  'uk_accountant',
  'complex_admin',
  'worker',
  'security_guard',
  'resident',
] as const;

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    role: z.enum(userRoles, { errorMap: () => ({ message: 'Invalid role' }) }),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    companyId: z.string().uuid().optional(),
    condoId: z.string().uuid().optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    role: z.enum(userRoles).optional(),
    isActive: z.boolean().optional(),
  }),
});
