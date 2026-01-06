import { AppDataSource } from '../db/data-source';
import { Meter } from '../entities/Meter';
import { MeterReading, ReadingSource } from '../entities/MeterReading';
import { logger } from '../utils/logger';
import { LessThanOrEqual } from 'typeorm';

const meterRepository = AppDataSource.getRepository(Meter);
const meterReadingRepository = AppDataSource.getRepository(MeterReading);

export class MeterService {
  /**
   * Get all meters for a unit
   */
  async getUnitMeters(unitId: string): Promise<Meter[]> {
    try {
      return await meterRepository.find({
        where: { unitId, isActive: true },
        relations: ['meterType'],
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get unit meters', { error, unitId });
      throw error;
    }
  }

  /**
   * Get meter readings
   */
  async getReadings(meterId: string, limit: number = 12): Promise<MeterReading[]> {
    try {
      return await meterReadingRepository.find({
        where: { meterId },
        relations: ['user'],
        order: { readingDate: 'DESC' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get meter readings', { error, meterId });
      throw error;
    }
  }

  /**
   * Submit meter reading
   */
  async submitReading(data: {
    meterId: string;
    userId: string;
    value: number;
    readingDate: string;
    source?: ReadingSource;
    photoUrl?: string;
    ocrConfidence?: number;
    notes?: string;
  }): Promise<MeterReading> {
    try {
      const meter = await meterRepository.findOne({
        where: { id: data.meterId },
      });

      if (!meter) {
        throw new Error('Meter not found');
      }

      // Check if reading already exists for this date
      const existingReading = await meterReadingRepository.findOne({
        where: {
          meterId: data.meterId,
          readingDate: new Date(data.readingDate),
        },
      });

      if (existingReading) {
        throw new Error('Reading for this date already exists');
      }

      // Validate reading value (should be greater than last reading)
      if (meter.lastReading && data.value < meter.lastReading) {
        throw new Error('Reading value cannot be less than previous reading');
      }

      const reading = meterReadingRepository.create({
        meterId: data.meterId,
        userId: data.userId,
        value: data.value,
        readingDate: new Date(data.readingDate),
        source: data.source || ReadingSource.MANUAL,
        photoUrl: data.photoUrl,
        ocrConfidence: data.ocrConfidence,
        notes: data.notes,
      });

      await meterReadingRepository.save(reading);

      // Update meter's last reading
      meter.lastReading = data.value;
      meter.lastReadingDate = new Date(data.readingDate);
      await meterRepository.save(meter);

      logger.info('Meter reading submitted', {
        meterId: data.meterId,
        value: data.value,
        source: data.source,
      });

      return reading;
    } catch (error) {
      logger.error('Failed to submit meter reading', { error, meterId: data.meterId });
      throw error;
    }
  }

  /**
   * Verify meter reading
   */
  async verifyReading(readingId: string, verifiedBy: string): Promise<void> {
    try {
      const reading = await meterReadingRepository.findOne({
        where: { id: readingId },
      });

      if (!reading) {
        throw new Error('Reading not found');
      }

      reading.isVerified = true;
      reading.verifiedBy = verifiedBy;

      await meterReadingRepository.save(reading);

      logger.info('Meter reading verified', { readingId, verifiedBy });
    } catch (error) {
      logger.error('Failed to verify meter reading', { error, readingId });
      throw error;
    }
  }

  /**
   * Get meter by serial number
   */
  async getMeterBySerialNumber(serialNumber: string): Promise<Meter | null> {
    return meterRepository.findOne({
      where: { serialNumber },
      relations: ['unit', 'meterType'],
    });
  }

  /**
   * Get unverified readings
   */
  async getUnverifiedReadings(limit: number = 50): Promise<MeterReading[]> {
    return meterReadingRepository.find({
      where: { isVerified: false },
      relations: ['meter', 'meter.unit', 'user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Calculate consumption between dates
   */
  async calculateConsumption(
    meterId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const readings = await meterReadingRepository.find({
      where: {
        meterId,
        readingDate: LessThanOrEqual(endDate),
      },
      order: { readingDate: 'ASC' },
    });

    if (readings.length < 2) {
      return 0;
    }

    const startReading = readings.find((r) => r.readingDate >= startDate);
    const endReading = readings[readings.length - 1];

    if (!startReading || !endReading) {
      return 0;
    }

    return Number(endReading.value) - Number(startReading.value);
  }
}

export const meterService = new MeterService();
