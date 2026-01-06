import { pool } from '../db';
import { logger } from '../utils/logger';

interface MeterReading {
  id?: string;
  meterId: string;
  userId: string;
  value: number;
  readingDate: string;
  source?: string;
  photoUrl?: string;
  ocrConfidence?: number;
  notes?: string;
}

export class MeterService {
  /**
   * Submit meter reading
   */
  async submitReading(reading: MeterReading): Promise<any> {
    try {
      const result = await pool.query(
        `INSERT INTO meter_readings (
          meter_id, user_id, value, reading_date, source, photo_url, ocr_confidence, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          reading.meterId,
          reading.userId,
          reading.value,
          reading.readingDate,
          reading.source || 'manual',
          reading.photoUrl || null,
          reading.ocrConfidence || null,
          reading.notes || null
        ]
      );
      
      logger.info('Meter reading submitted', { 
        readingId: result.rows[0].id,
        meterId: reading.meterId 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to submit meter reading', { error, reading });
      throw error;
    }
  }

  /**
   * Get readings for a meter
   */
  async getReadings(meterId: string, limit: number = 12): Promise<any[]> {
    const result = await pool.query(
      `SELECT mr.*, u.first_name, u.last_name
       FROM meter_readings mr
       LEFT JOIN users u ON mr.user_id = u.id
       WHERE mr.meter_id = $1 AND mr.deleted_at IS NULL
       ORDER BY mr.reading_date DESC
       LIMIT $2`,
      [meterId, limit]
    );
    return result.rows;
  }

  /**
   * Get meters for a unit
   */
  async getUnitMeters(unitId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT m.*, mt.code, mt.name, mt.unit
       FROM meters m
       JOIN meter_types mt ON m.meter_type_id = mt.id
       WHERE m.unit_id = $1 AND m.is_active = true AND m.deleted_at IS NULL
       ORDER BY mt.code`,
      [unitId]
    );
    return result.rows;
  }

  /**
   * Verify reading
   */
  async verifyReading(readingId: string, verifiedBy: string): Promise<void> {
    await pool.query(
      `UPDATE meter_readings
       SET is_verified = true, verified_by = $1, verified_at = NOW()
       WHERE id = $2`,
      [verifiedBy, readingId]
    );
    logger.info('Meter reading verified', { readingId, verifiedBy });
  }
}

export const meterService = new MeterService();
