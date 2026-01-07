import { z } from 'zod';

/**
 * License plate validation
 * Accepts: A123BC, A-123-BC, AB1234CD
 */
const licensePlateRegex = /^[A-Z0-9-]{5,15}$/;

export const createPermanentVehicleSchema = z.object({
  body: z.object({
    unitId: z.string().uuid('Invalid unit ID format'),
    licensePlate: z
      .string()
      .min(5, 'License plate must be at least 5 characters')
      .max(15, 'License plate must be at most 15 characters')
      .regex(licensePlateRegex, 'Invalid license plate format (use A-Z, 0-9, -)'),
    make: z.string().max(50, 'Make must be at most 50 characters').optional(),
    model: z.string().max(50, 'Model must be at most 50 characters').optional(),
    color: z.string().max(30, 'Color must be at most 30 characters').optional(),
    parkingSpot: z.string().max(20, 'Parking spot must be at most 20 characters').optional(),
  }),
});

export const createTemporaryPassSchema = z.object({
  body: z.object({
    unitId: z.string().uuid('Invalid unit ID format'),
    licensePlate: z
      .string()
      .min(5, 'License plate must be at least 5 characters')
      .max(15, 'License plate must be at most 15 characters')
      .regex(licensePlateRegex, 'Invalid license plate format (use A-Z, 0-9, -)'),
  }),
});

export const checkVehicleSchema = z.object({
  params: z.object({
    plate: z
      .string()
      .min(5, 'License plate must be at least 5 characters')
      .max(15, 'License plate must be at most 15 characters'),
  }),
});

export const getUnitVehiclesSchema = z.object({
  params: z.object({
    unitId: z.string().uuid('Invalid unit ID format'),
  }),
});

export const deleteVehicleSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid vehicle ID format'),
  }),
  body: z.object({
    unitId: z.string().uuid('Invalid unit ID format'),
  }),
});

export const deleteTemporaryPassSchema = z.object({
  params: z.object({
    plate: z.string().min(5).max(15),
  }),
  body: z.object({
    unitId: z.string().uuid('Invalid unit ID format'),
  }),
});

export const updateCondoVehicleSettingsSchema = z.object({
  params: z.object({
    condoId: z.string().uuid('Invalid condo ID format'),
  }),
  body: z.object({
    maxVehiclesPerUnit: z
      .number()
      .int()
      .min(1, 'Must allow at least 1 vehicle')
      .max(10, 'Cannot allow more than 10 vehicles')
      .optional(),
    temporaryPassDurationHours: z
      .number()
      .int()
      .min(1, 'Duration must be at least 1 hour')
      .max(168, 'Duration cannot exceed 1 week (168 hours)')
      .optional(),
  }),
});
