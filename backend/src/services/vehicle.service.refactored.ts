import { AppDataSource } from '../db/data-source';
import { Vehicle } from '../entities/Vehicle';
import { Unit } from '../entities/Unit';
import { VehicleAccessLog } from '../entities/VehicleAccessLog';
import { temporaryPassService } from './temporary-pass.service';
import { logger } from '../utils/logger';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../utils/errors';
import { Between } from 'typeorm';

const vehicleRepository = AppDataSource.getRepository(Vehicle);
const unitRepository = AppDataSource.getRepository(Unit);
const accessLogRepository = AppDataSource.getRepository(VehicleAccessLog);

interface CreateVehicleDto {
  unitId: string;
  licensePlate: string;
  make?: string;
  model?: string;
  color?: string;
  parkingSpot?: string;
  createdBy: string;
}

interface CreateTemporaryPassDto {
  unitId: string;
  licensePlate: string;
  createdBy: string;
}

interface AccessHistoryFilter {
  unitId?: string;
  licensePlate?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

class VehicleService {
  /**
   * Normalize license plate: uppercase, remove spaces
   */
  private normalizeLicensePlate(plate: string): string {
    return plate.toUpperCase().replace(/\s+/g, '');
  }

  /**
   * Create permanent vehicle
   */
  async createPermanentVehicle(data: CreateVehicleDto): Promise<Vehicle> {
    const normalizedPlate = this.normalizeLicensePlate(data.licensePlate);

    // Check if license plate already exists
    const existing = await vehicleRepository.findOne({
      where: { licensePlate: normalizedPlate },
    });

    if (existing) {
      throw new ConflictError('License plate already registered');
    }

    // Get unit with condo settings
    const unit = await unitRepository.findOne({
      where: { id: data.unitId },
      relations: ['condo'],
    });

    if (!unit) {
      throw new NotFoundError('Unit');
    }

    // Check vehicle limit
    const maxVehicles = unit.condo?.maxVehiclesPerUnit || 2;
    const currentCount = await vehicleRepository.count({
      where: { unitId: data.unitId, isActive: true },
    });

    if (currentCount >= maxVehicles) {
      throw new BadRequestError(
        `Unit has reached maximum vehicles limit (${maxVehicles})`
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
      licensePlate: normalizedPlate,
      unitId: data.unitId,
    });

    return vehicle;
  }

  /**
   * Create temporary pass (duration from condo settings)
   */
  async createTemporaryPass(data: CreateTemporaryPassDto) {
    const normalizedPlate = this.normalizeLicensePlate(data.licensePlate);

    // Get unit with condo settings
    const unit = await unitRepository.findOne({
      where: { id: data.unitId },
      relations: ['condo'],
    });

    if (!unit) {
      throw new NotFoundError('Unit');
    }

    // Get duration from condo settings
    const durationHours = unit.condo?.temporaryPassDurationHours || 24;

    // Create pass in Redis
    const pass = await temporaryPassService.createTemporaryPass(
      normalizedPlate,
      data.unitId,
      durationHours
    );

    return pass;
  }

  /**
   * Check vehicle access (called by security guard)
   */
  async checkVehicleAccess(licensePlate: string, checkedBy: string) {
    const normalizedPlate = this.normalizeLicensePlate(licensePlate);

    // Check permanent vehicle
    const permanent = await vehicleRepository.findOne({
      where: { licensePlate: normalizedPlate, isActive: true },
      relations: ['unit', 'unit.building', 'unit.entrance'],
    });

    if (permanent) {
      // Log access
      await this.logAccess({
        vehicleId: permanent.id,
        licensePlate: normalizedPlate,
        unitId: permanent.unitId,
        unitNumber: permanent.unit.unitNumber,
        buildingNumber: permanent.unit.building?.buildingNumber,
        entranceNumber: permanent.unit.entrance?.entranceNumber,
        accessType: 'permanent',
        allowed: true,
        expiresAt: null,
      });

      return {
        allowed: true,
        type: 'permanent',
        unitId: permanent.unitId,
        unitNumber: permanent.unit.unitNumber,
        buildingNumber: permanent.unit.building?.buildingNumber,
        entranceNumber: permanent.unit.entrance?.entranceNumber,
      };
    }

    // Check temporary pass
    const tempPass = await temporaryPassService.getTemporaryPass(normalizedPlate);

    if (tempPass && new Date() < tempPass.expiresAt) {
      // Get unit details
      const unit = await unitRepository.findOne({
        where: { id: tempPass.unitId },
        relations: ['building', 'entrance'],
      });

      // Log access
      await this.logAccess({
        vehicleId: null,
        licensePlate: normalizedPlate,
        unitId: tempPass.unitId,
        unitNumber: unit?.unitNumber,
        buildingNumber: unit?.building?.buildingNumber,
        entranceNumber: unit?.entrance?.entranceNumber,
        accessType: 'temporary',
        allowed: true,
        expiresAt: tempPass.expiresAt,
      });

      return {
        allowed: true,
        type: 'temporary',
        unitId: tempPass.unitId,
        unitNumber: unit?.unitNumber,
        buildingNumber: unit?.building?.buildingNumber,
        entranceNumber: unit?.entrance?.entranceNumber,
        expiresAt: tempPass.expiresAt,
      };
    }

    // Access denied
    await this.logAccess({
      vehicleId: null,
      licensePlate: normalizedPlate,
      unitId: null,
      unitNumber: null,
      buildingNumber: null,
      entranceNumber: null,
      accessType: 'unknown',
      allowed: false,
      expiresAt: null,
    });

    return {
      allowed: false,
      type: 'unknown',
    };
  }

  /**
   * Log vehicle access
   */
  private async logAccess(data: Partial<VehicleAccessLog>): Promise<void> {
    try {
      const log = accessLogRepository.create(data);
      await accessLogRepository.save(log);
    } catch (error) {
      logger.error('Failed to log vehicle access', { error, data });
    }
  }

  /**
   * Get unit permanent vehicles
   */
  async getUnitVehicles(unitId: string): Promise<Vehicle[]> {
    return vehicleRepository.find({
      where: { unitId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get unit temporary passes
   */
  async getUnitTemporaryPasses(unitId: string) {
    return temporaryPassService.getUnitTemporaryPasses(unitId);
  }

  /**
   * Get access history
   */
  async getAccessHistory(filter: AccessHistoryFilter) {
    const where: any = {};

    if (filter.unitId) {
      where.unitId = filter.unitId;
    }

    if (filter.licensePlate) {
      where.licensePlate = this.normalizeLicensePlate(filter.licensePlate);
    }

    if (filter.from && filter.to) {
      where.timestamp = Between(filter.from, filter.to);
    }

    const logs = await accessLogRepository.find({
      where,
      order: { timestamp: 'DESC' },
      take: filter.limit || 100,
      skip: filter.offset || 0,
    });

    return logs;
  }

  /**
   * Get condo vehicle settings
   */
  async getCondoVehicleSettings(condoId: string) {
    const unit = await unitRepository.findOne({
      where: { condoId },
      relations: ['condo'],
    });

    if (!unit || !unit.condo) {
      throw new NotFoundError('Condo');
    }

    return {
      maxVehiclesPerUnit: unit.condo.maxVehiclesPerUnit || 2,
      temporaryPassDurationHours: unit.condo.temporaryPassDurationHours || 24,
    };
  }

  /**
   * Update condo vehicle settings
   */
  async updateCondoVehicleSettings(
    condoId: string,
    settings: { maxVehiclesPerUnit?: number; temporaryPassDurationHours?: number }
  ) {
    const unit = await unitRepository.findOne({
      where: { condoId },
      relations: ['condo'],
    });

    if (!unit || !unit.condo) {
      throw new NotFoundError('Condo');
    }

    if (settings.maxVehiclesPerUnit !== undefined) {
      if (settings.maxVehiclesPerUnit < 1 || settings.maxVehiclesPerUnit > 10) {
        throw new BadRequestError('maxVehiclesPerUnit must be between 1 and 10');
      }
      unit.condo.maxVehiclesPerUnit = settings.maxVehiclesPerUnit;
    }

    if (settings.temporaryPassDurationHours !== undefined) {
      if (
        settings.temporaryPassDurationHours < 1 ||
        settings.temporaryPassDurationHours > 168
      ) {
        throw new BadRequestError(
          'temporaryPassDurationHours must be between 1 and 168'
        );
      }
      unit.condo.temporaryPassDurationHours = settings.temporaryPassDurationHours;
    }

    await unitRepository.manager.save(unit.condo);
  }

  /**
   * Delete vehicle
   */
  async deleteVehicle(vehicleId: string, unitId: string): Promise<void> {
    const vehicle = await vehicleRepository.findOne({
      where: { id: vehicleId, unitId },
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle');
    }

    await vehicleRepository.remove(vehicle);

    logger.info('Vehicle deleted', { vehicleId, unitId });
  }

  /**
   * Delete temporary pass
   */
  async deleteTemporaryPass(licensePlate: string, unitId: string): Promise<void> {
    const normalizedPlate = this.normalizeLicensePlate(licensePlate);
    await temporaryPassService.deleteTemporaryPass(normalizedPlate, unitId);

    logger.info('Temporary pass deleted', { licensePlate: normalizedPlate, unitId });
  }
}

export const vehicleService = new VehicleService();
