import { Router, Request, Response } from 'express';
import { vehicleService } from '../services/vehicle.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/v1/vehicles/permanent
 * @desc    Create permanent vehicle for a unit
 * @access  Private (resident, admin)
 */
router.post('/permanent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { unitId, licensePlate, make, model, color, parkingSpot } = req.body;

    if (!unitId || !licensePlate) {
      return res.status(400).json({
        success: false,
        error: 'unitId and licensePlate are required',
      });
    }

    // TODO: Check if user has access to this unit

    const vehicle = await vehicleService.createPermanentVehicle({
      unitId,
      licensePlate,
      make,
      model,
      color,
      parkingSpot,
    });

    res.status(201).json({ success: true, vehicle });
  } catch (error: any) {
    logger.error('Error creating permanent vehicle', { error });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/vehicles/temporary
 * @desc    Create temporary vehicle pass (24 hours)
 * @access  Private (resident, admin)
 */
router.post('/temporary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { unitId, licensePlate } = req.body;

    if (!unitId || !licensePlate) {
      return res.status(400).json({
        success: false,
        error: 'unitId and licensePlate are required',
      });
    }

    // TODO: Check if user has access to this unit

    const pass = await vehicleService.createTemporaryPass({
      unitId,
      licensePlate,
      createdBy: userId,
    });

    res.status(201).json({ success: true, pass });
  } catch (error: any) {
    logger.error('Error creating temporary pass', { error });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/vehicles/check/:plate
 * @desc    Check vehicle access (for security guard)
 * @access  Private (security guard, admin)
 */
router.get('/check/:plate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { plate } = req.params;

    if (!plate) {
      return res.status(400).json({
        success: false,
        error: 'License plate is required',
      });
    }

    // TODO: Check if user is security guard

    const result = await vehicleService.checkVehicleAccess(plate);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error checking vehicle access', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/vehicles/unit/:unitId
 * @desc    Get all vehicles (permanent + temporary) for a unit
 * @access  Private (resident, admin)
 */
router.get('/unit/:unitId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { unitId } = req.params;

    // TODO: Check if user has access to this unit

    const [permanentVehicles, temporaryPasses] = await Promise.all([
      vehicleService.getUnitVehicles(unitId),
      vehicleService.getUnitTemporaryPasses(unitId),
    ]);

    res.json({
      success: true,
      permanent: permanentVehicles,
      temporary: temporaryPasses,
    });
  } catch (error: any) {
    logger.error('Error getting unit vehicles', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/vehicles/history
 * @desc    Get vehicle access history
 * @access  Private (security guard, admin)
 */
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { unitId, licensePlate, from, to } = req.query;

    // TODO: Check if user is security guard or admin

    const history = await vehicleService.getAccessHistory({
      unitId: unitId as string,
      licensePlate: licensePlate as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    res.json({ success: true, history });
  } catch (error: any) {
    logger.error('Error getting access history', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/v1/vehicles/permanent/:id
 * @desc    Delete permanent vehicle
 * @access  Private (resident, admin)
 */
router.delete('/permanent/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({
        success: false,
        error: 'unitId is required',
      });
    }

    // TODO: Check if user has access to this unit

    await vehicleService.deleteVehicle(id, unitId);

    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (error: any) {
    logger.error('Error deleting vehicle', { error });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/v1/vehicles/temporary/:plate
 * @desc    Delete temporary pass
 * @access  Private (resident, admin)
 */
router.delete('/temporary/:plate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { plate } = req.params;
    const { unitId } = req.body;

    if (!unitId) {
      return res.status(400).json({
        success: false,
        error: 'unitId is required',
      });
    }

    // TODO: Check if user has access to this unit

    await vehicleService.deleteTemporaryPass(plate, unitId);

    res.json({ success: true, message: 'Temporary pass deleted' });
  } catch (error: any) {
    logger.error('Error deleting temporary pass', { error });
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
