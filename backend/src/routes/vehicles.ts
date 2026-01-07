import { Router } from 'express';
import { vehicleService } from '../services/vehicle.service';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  authorize,
  canAccessUnit,
  canAccessCondo,
  isSecurityGuard,
} from '../middleware/authorize.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../middleware/error-handler.middleware';
import {
  createPermanentVehicleSchema,
  createTemporaryPassSchema,
  checkVehicleSchema,
  getUnitVehiclesSchema,
  deleteVehicleSchema,
  deleteTemporaryPassSchema,
  updateCondoVehicleSettingsSchema,
} from '../schemas/vehicle.schema';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/v1/vehicles/permanent
 * @desc    Create permanent vehicle for a unit
 * @access  Private (resident, admin)
 */
router.post(
  '/permanent',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director', 'super_admin'),
  validate(createPermanentVehicleSchema),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id;
    const { unitId, licensePlate, make, model, color, parkingSpot } = req.body;

    const vehicle = await vehicleService.createPermanentVehicle({
      unitId,
      licensePlate,
      make,
      model,
      color,
      parkingSpot,
      createdBy: userId,
    });

    logger.info('Permanent vehicle created', { vehicleId: vehicle.id, unitId, userId });

    res.status(201).json({ success: true, vehicle });
  })
);

/**
 * @route   POST /api/v1/vehicles/temporary
 * @desc    Create temporary vehicle pass (duration from condo settings)
 * @access  Private (resident, admin)
 */
router.post(
  '/temporary',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director', 'super_admin'),
  validate(createTemporaryPassSchema),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id;
    const { unitId, licensePlate } = req.body;

    const pass = await vehicleService.createTemporaryPass({
      unitId,
      licensePlate,
      createdBy: userId,
    });

    logger.info('Temporary pass created', { licensePlate, unitId, userId });

    res.status(201).json({ success: true, pass });
  })
);

/**
 * @route   GET /api/v1/vehicles/check/:plate
 * @desc    Check vehicle access (for security guard)
 * @access  Private (security guard, admin)
 */
router.get(
  '/check/:plate',
  authenticateToken,
  isSecurityGuard(),
  validate(checkVehicleSchema),
  asyncHandler(async (req, res) => {
    const { plate } = req.params;
    const userId = (req as any).user.id;

    const result = await vehicleService.checkVehicleAccess(plate, userId);

    res.json({ success: true, ...result });
  })
);

/**
 * @route   GET /api/v1/vehicles/unit/:unitId
 * @desc    Get all vehicles (permanent + temporary) for a unit
 * @access  Private (resident, admin)
 */
router.get(
  '/unit/:unitId',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director', 'super_admin'),
  validate(getUnitVehiclesSchema),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const { unitId } = req.params;

    const [permanentVehicles, temporaryPasses] = await Promise.all([
      vehicleService.getUnitVehicles(unitId),
      vehicleService.getUnitTemporaryPasses(unitId),
    ]);

    res.json({
      success: true,
      permanent: permanentVehicles,
      temporary: temporaryPasses,
    });
  })
);

/**
 * @route   GET /api/v1/vehicles/history
 * @desc    Get vehicle access history
 * @access  Private (security guard, admin)
 */
router.get(
  '/history',
  authenticateToken,
  isSecurityGuard(),
  asyncHandler(async (req, res) => {
    const { unitId, licensePlate, from, to, limit = '100', offset = '0' } = req.query;

    const history = await vehicleService.getAccessHistory({
      unitId: unitId as string,
      licensePlate: licensePlate as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ success: true, history });
  })
);

/**
 * @route   GET /api/v1/vehicles/settings/:condoId
 * @desc    Get condo vehicle settings
 * @access  Private (admin)
 */
router.get(
  '/settings/:condoId',
  authenticateToken,
  authorize('complex_admin', 'uk_director', 'super_admin'),
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    const { condoId } = req.params;

    const settings = await vehicleService.getCondoVehicleSettings(condoId);

    res.json({ success: true, settings });
  })
);

/**
 * @route   PUT /api/v1/vehicles/settings/:condoId
 * @desc    Update condo vehicle settings
 * @access  Private (admin)
 */
router.put(
  '/settings/:condoId',
  authenticateToken,
  authorize('complex_admin', 'uk_director', 'super_admin'),
  validate(updateCondoVehicleSettingsSchema),
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    const { condoId } = req.params;
    const { maxVehiclesPerUnit, temporaryPassDurationHours } = req.body;
    const userId = (req as any).user.id;

    await vehicleService.updateCondoVehicleSettings(condoId, {
      maxVehiclesPerUnit,
      temporaryPassDurationHours,
    });

    logger.info('Condo vehicle settings updated', {
      condoId,
      maxVehiclesPerUnit,
      temporaryPassDurationHours,
      userId,
    });

    res.json({ success: true, message: 'Settings updated' });
  })
);

/**
 * @route   DELETE /api/v1/vehicles/permanent/:id
 * @desc    Delete permanent vehicle
 * @access  Private (resident, admin)
 */
router.delete(
  '/permanent/:id',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director', 'super_admin'),
  validate(deleteVehicleSchema),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { unitId } = req.body;
    const userId = (req as any).user.id;

    await vehicleService.deleteVehicle(id, unitId);

    logger.info('Permanent vehicle deleted', { vehicleId: id, unitId, userId });

    res.json({ success: true, message: 'Vehicle deleted' });
  })
);

/**
 * @route   DELETE /api/v1/vehicles/temporary/:plate
 * @desc    Delete temporary pass
 * @access  Private (resident, admin)
 */
router.delete(
  '/temporary/:plate',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director', 'super_admin'),
  validate(deleteTemporaryPassSchema),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const { plate } = req.params;
    const { unitId } = req.body;
    const userId = (req as any).user.id;

    await vehicleService.deleteTemporaryPass(plate, unitId);

    logger.info('Temporary pass deleted', { licensePlate: plate, unitId, userId });

    res.json({ success: true, message: 'Temporary pass deleted' });
  })
);

export default router;
