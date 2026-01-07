import { AppDataSource } from '../db/data-source';
import { Vehicle } from '../entities/Vehicle';
import { Unit } from '../entities/Unit';
import { Condo } from '../entities/Condo';
import { logger } from '../utils/logger';
import { LessThan, MoreThan, In } from 'typeorm';

const vehicleRepository = AppDataSource.getRepository(Vehicle);
const unitRepository = AppDataSource.getRepository(Unit);
const condoRepository = AppDataSource.getRepository(Condo);

export interface VehicleAccessLog {
  id: string;
  vehicleId?: string;
  licensePlate: string;
  unitId?: string;
  unitNumber?: string;
  accessType: 'permanent' | 'temporary' | 'unknown';
  timestamp: Date;
  grantedBy?: string;
}

const accessLogs: VehicleAccessLog[] = [];

export class VehicleService {
  /**
   * Create permanent vehicle for a unit
   */
  async createPermanentVehicle(data: {
    unitId: string;
    licensePlate: string;
    make?: string;
    model?: string;
    color?: string;
    parkingSpot?: string;
  }): Promise<Vehicle> {
    try {
      // Check if unit exists and get condo settings
      const unit = await unitRepository.findOne({
        where: { id: data.unitId },
        relations: ['condo'],
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      // Get condo settings for vehicle limit
      const maxVehicles = unit.condo?.maxVehiclesPerUnit || 2;

      // Normalize license plate (uppercase, no spaces)
      const normalizedPlate = data.licensePlate.toUpperCase().replace(/\s+/g, '');

      // Check if license plate already exists
      const existing = await vehicleRepository.findOne({
        where: { licensePlate: normalizedPlate },
      });

      if (existing) {
        throw new Error('License plate already registered');
      }

      // Check unit vehicle limit (from condo settings)
      const unitVehicles = await vehicleRepository.count({
        where: { unitId: data.unitId, isActive: true },
      });

      if (unitVehicles >= maxVehicles) {
        throw new Error(
          `Unit has reached maximum permanent vehicles limit (${maxVehicles} per unit)`
        );
      }

      // Create vehicle
      const vehicle = vehicleRepository.create({
        unitId: data.unitId,
        licensePlate: normalizedPlate,
        make: data.make,
        model: data.model,
        color: data.color,
        parkingSpot: data.parkingSpot,
        isActive: true,
      });

      await vehicleRepository.save(vehicle);

      logger.info('Permanent vehicle created', {
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        unitId: data.unitId,
        maxVehicles,
      });

      return vehicle;
    } catch (error) {
      logger.error('Failed to create permanent vehicle', { error, data });
      throw error;
    }
  }

  /**
   * Create temporary vehicle pass (duration from condo settings)
   * Note: In-memory storage for simplicity. In production, use database table.
   */
  private temporaryPasses: Map<string, { unitId: string; expiresAt: Date; createdBy: string }> =
    new Map();

  async createTemporaryPass(data: {
    unitId: string;
    licensePlate: string;
    createdBy: string;
  }): Promise<{ licensePlate: string; expiresAt: Date }> {
    try {
      // Check if unit exists and get condo settings
      const unit = await unitRepository.findOne({
        where: { id: data.unitId },
        relations: ['condo'],
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      // Get condo settings for pass duration
      const durationHours = unit.condo?.temporaryPassDurationHours || 24;

      // Normalize license plate
      const normalizedPlate = data.licensePlate.toUpperCase().replace(/\s+/g, '');

      // Create expiration (from condo settings)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + durationHours);

      // Store temporary pass
      this.temporaryPasses.set(normalizedPlate, {
        unitId: data.unitId,
        expiresAt,
        createdBy: data.createdBy,
      });

      logger.info('Temporary pass created', {
        licensePlate: normalizedPlate,
        unitId: data.unitId,
        expiresAt,
        durationHours,
      });

      return {
        licensePlate: normalizedPlate,
        expiresAt,
      };
    } catch (error) {
      logger.error('Failed to create temporary pass', { error, data });
      throw error;
    }
  }

  /**
   * Check vehicle access (for security guard)
   */
  async checkVehicleAccess(licensePlate: string): Promise<{
    allowed: boolean;
    type: 'permanent' | 'temporary' | 'unknown';
    unitId?: string;
    unitNumber?: string;
    buildingNumber?: string;
    entranceNumber?: string;
    expiresAt?: Date;
    vehicle?: Vehicle;
  }> {
    try {
      const normalizedPlate = licensePlate.toUpperCase().replace(/\s+/g, '');

      // Check permanent vehicle
      const vehicle = await vehicleRepository.findOne({
        where: { licensePlate: normalizedPlate, isActive: true },
        relations: ['unit', 'unit.entrance', 'unit.entrance.building'],
      });

      if (vehicle) {
        // Log access
        this.logAccess({
          id: `log-${Date.now()}`,
          vehicleId: vehicle.id,
          licensePlate: normalizedPlate,
          unitId: vehicle.unitId,
          unitNumber: vehicle.unit?.unitNumber,
          accessType: 'permanent',
          timestamp: new Date(),
        });

        return {
          allowed: true,
          type: 'permanent',
          unitId: vehicle.unitId,
          unitNumber: vehicle.unit?.unitNumber,
          buildingNumber: vehicle.unit?.entrance?.building?.buildingNumber,
          entranceNumber: vehicle.unit?.entrance?.entranceNumber,
          vehicle,
        };
      }

      // Check temporary pass
      const tempPass = this.temporaryPasses.get(normalizedPlate);
      if (tempPass) {
        const now = new Date();
        if (tempPass.expiresAt > now) {
          // Get unit info
          const unit = await unitRepository.findOne({
            where: { id: tempPass.unitId },
            relations: ['entrance', 'entrance.building'],
          });

          // Log access
          this.logAccess({
            id: `log-${Date.now()}`,
            licensePlate: normalizedPlate,
            unitId: tempPass.unitId,
            unitNumber: unit?.unitNumber,
            accessType: 'temporary',
            timestamp: new Date(),
          });

          return {
            allowed: true,
            type: 'temporary',
            unitId: tempPass.unitId,
            unitNumber: unit?.unitNumber,
            buildingNumber: unit?.entrance?.building?.buildingNumber,
            entranceNumber: unit?.entrance?.entranceNumber,
            expiresAt: tempPass.expiresAt,
          };
        } else {
          // Expired, remove
          this.temporaryPasses.delete(normalizedPlate);
        }
      }

      // Log denied access
      this.logAccess({
        id: `log-${Date.now()}`,
        licensePlate: normalizedPlate,
        accessType: 'unknown',
        timestamp: new Date(),
      });

      return {
        allowed: false,
        type: 'unknown',
      };
    } catch (error) {
      logger.error('Failed to check vehicle access', { error, licensePlate });
      throw error;
    }
  }

  /**
   * Get vehicles for a unit
   */
  async getUnitVehicles(unitId: string): Promise<Vehicle[]> {
    try {
      return await vehicleRepository.find({
        where: { unitId, isActive: true },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      logger.error('Failed to get unit vehicles', { error, unitId });
      throw error;
    }
  }

  /**
   * Get temporary passes for a unit
   */
  async getUnitTemporaryPasses(unitId: string): Promise<Array<{ licensePlate: string; expiresAt: Date }>> {
    const passes: Array<{ licensePlate: string; expiresAt: Date }> = [];
    const now = new Date();

    this.temporaryPasses.forEach((pass, plate) => {
      if (pass.unitId === unitId && pass.expiresAt > now) {
        passes.push({
          licensePlate: plate,
          expiresAt: pass.expiresAt,
        });
      }
    });

    return passes;
  }

  /**
   * Get condo vehicle settings
   */
  async getCondoVehicleSettings(condoId: string): Promise<{
    maxVehiclesPerUnit: number;
    temporaryPassDurationHours: number;
  }> {
    try {
      const condo = await condoRepository.findOne({ where: { id: condoId } });

      if (!condo) {
        throw new Error('Condo not found');
      }

      return {
        maxVehiclesPerUnit: condo.maxVehiclesPerUnit || 2,
        temporaryPassDurationHours: condo.temporaryPassDurationHours || 24,
      };
    } catch (error) {
      logger.error('Failed to get condo vehicle settings', { error, condoId });
      throw error;
    }
  }

  /**
   * Update condo vehicle settings
   */
  async updateCondoVehicleSettings(
    condoId: string,
    settings: {
      maxVehiclesPerUnit?: number;
      temporaryPassDurationHours?: number;
    }
  ): Promise<void> {
    try {
      const condo = await condoRepository.findOne({ where: { id: condoId } });

      if (!condo) {
        throw new Error('Condo not found');
      }

      if (settings.maxVehiclesPerUnit !== undefined) {
        if (settings.maxVehiclesPerUnit < 1 || settings.maxVehiclesPerUnit > 10) {
          throw new Error('maxVehiclesPerUnit must be between 1 and 10');
        }
        condo.maxVehiclesPerUnit = settings.maxVehiclesPerUnit;
      }

      if (settings.temporaryPassDurationHours !== undefined) {
        if (
          settings.temporaryPassDurationHours < 1 ||
          settings.temporaryPassDurationHours > 168
        ) {
          throw new Error('temporaryPassDurationHours must be between 1 and 168 (1 week)');
        }
        condo.temporaryPassDurationHours = settings.temporaryPassDurationHours;
      }

      await condoRepository.save(condo);

      logger.info('Condo vehicle settings updated', { condoId, settings });
    } catch (error) {
      logger.error('Failed to update condo vehicle settings', { error, condoId, settings });
      throw error;
    }
  }

  /**
   * Delete vehicle
   */
  async deleteVehicle(vehicleId: string, unitId: string): Promise<void> {
    try {
      const vehicle = await vehicleRepository.findOne({
        where: { id: vehicleId, unitId },
      });

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      await vehicleRepository.remove(vehicle);

      logger.info('Vehicle deleted', { vehicleId, unitId });
    } catch (error) {
      logger.error('Failed to delete vehicle', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Delete temporary pass
   */
  async deleteTemporaryPass(licensePlate: string, unitId: string): Promise<void> {
    try {
      const normalizedPlate = licensePlate.toUpperCase().replace(/\s+/g, '');
      const pass = this.temporaryPasses.get(normalizedPlate);

      if (!pass || pass.unitId !== unitId) {
        throw new Error('Temporary pass not found');
      }

      this.temporaryPasses.delete(normalizedPlate);

      logger.info('Temporary pass deleted', { licensePlate: normalizedPlate, unitId });
    } catch (error) {
      logger.error('Failed to delete temporary pass', { error, licensePlate });
      throw error;
    }
  }

  /**
   * Get access history (last 100 entries)
   */
  async getAccessHistory(filter?: {
    unitId?: string;
    licensePlate?: string;
    from?: Date;
    to?: Date;
  }): Promise<VehicleAccessLog[]> {
    let logs = [...accessLogs];

    if (filter) {
      if (filter.unitId) {
        logs = logs.filter((log) => log.unitId === filter.unitId);
      }
      if (filter.licensePlate) {
        const normalized = filter.licensePlate.toUpperCase().replace(/\s+/g, '');
        logs = logs.filter((log) => log.licensePlate === normalized);
      }
      if (filter.from) {
        logs = logs.filter((log) => log.timestamp >= filter.from!);
      }
      if (filter.to) {
        logs = logs.filter((log) => log.timestamp <= filter.to!);
      }
    }

    return logs.slice(-100).reverse();
  }

  /**
   * Log access attempt
   */
  private logAccess(log: VehicleAccessLog): void {
    accessLogs.push(log);
    // Keep only last 1000 logs in memory
    if (accessLogs.length > 1000) {
      accessLogs.shift();
    }
  }

  /**
   * Cleanup expired temporary passes (called by worker)
   */
  async cleanupExpiredPasses(): Promise<number> {
    const now = new Date();
    let count = 0;

    this.temporaryPasses.forEach((pass, plate) => {
      if (pass.expiresAt <= now) {
        this.temporaryPasses.delete(plate);
        count++;
      }
    });

    if (count > 0) {
      logger.info('Expired temporary passes cleaned up', { count });
    }

    return count;
  }
}

export const vehicleService = new VehicleService();
