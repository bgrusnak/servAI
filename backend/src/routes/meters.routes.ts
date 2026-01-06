import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { meterService } from '../services/meter.service';
import { perplexityService } from '../services/perplexity.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   GET /api/v1/units/:unitId/meters
 * @desc    Get all meters for a unit
 * @access  Private
 */
router.get('/units/:unitId/meters', authenticateToken, async (req, res) => {
  try {
    const { unitId } = req.params;
    const meters = await meterService.getUnitMeters(unitId);
    res.json({ success: true, meters });
  } catch (error: any) {
    logger.error('Error fetching unit meters', { error, unitId: req.params.unitId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/meters/:meterId/readings
 * @desc    Get readings for a meter
 * @access  Private
 */
router.get('/meters/:meterId/readings', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.params;
    const limit = parseInt(req.query.limit as string) || 12;
    const readings = await meterService.getReadings(meterId, limit);
    res.json({ success: true, readings });
  } catch (error: any) {
    logger.error('Error fetching meter readings', { error, meterId: req.params.meterId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/meters/:meterId/readings
 * @desc    Submit meter reading
 * @access  Private
 */
router.post('/meters/:meterId/readings', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.params;
    const userId = (req as any).user.id;
    const { value, readingDate, notes } = req.body;

    if (!value || !readingDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Value and readingDate are required' 
      });
    }

    const reading = await meterService.submitReading({
      meterId,
      userId,
      value: parseFloat(value),
      readingDate,
      source: 'manual',
      notes
    });

    res.status(201).json({ success: true, reading });
  } catch (error: any) {
    logger.error('Error submitting meter reading', { error, meterId: req.params.meterId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/meters/readings/ocr
 * @desc    Submit meter reading from photo (OCR)
 * @access  Private
 */
router.post('/meters/readings/ocr', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { meterId, photoUrl } = req.body;

    if (!meterId || !photoUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'meterId and photoUrl are required' 
      });
    }

    // Use Perplexity OCR to recognize meter reading
    const ocrResult = await perplexityService.recognizeMeterReading(photoUrl);

    if (!ocrResult.success || !ocrResult.value) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not recognize meter reading from photo',
        details: ocrResult
      });
    }

    const reading = await meterService.submitReading({
      meterId,
      userId,
      value: ocrResult.value,
      readingDate: new Date().toISOString().split('T')[0],
      source: 'ocr',
      photoUrl,
      ocrConfidence: ocrResult.confidence
    });

    res.status(201).json({ 
      success: true, 
      reading,
      ocrResult 
    });
  } catch (error: any) {
    logger.error('Error submitting OCR meter reading', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PATCH /api/v1/meters/readings/:readingId/verify
 * @desc    Verify meter reading
 * @access  Private (Admin only)
 */
router.patch('/meters/readings/:readingId/verify', authenticateToken, async (req, res) => {
  try {
    const { readingId } = req.params;
    const userId = (req as any).user.id;

    // TODO: Check if user has admin role

    await meterService.verifyReading(readingId, userId);
    res.json({ success: true, message: 'Reading verified' });
  } catch (error: any) {
    logger.error('Error verifying meter reading', { error, readingId: req.params.readingId });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
