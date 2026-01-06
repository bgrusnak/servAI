import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadService } from '../services/upload.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * @route   POST /api/v1/upload/document
 * @desc    Upload document
 * @access  Private
 */
router.post('/upload/document', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const userId = (req as any).user.id;
    const { condoId, title, description, documentType, isPublic } = req.body;

    if (!condoId || !title || !documentType) {
      return res.status(400).json({ 
        success: false, 
        error: 'condoId, title, and documentType are required' 
      });
    }

    const document = await uploadService.uploadDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      condoId,
      userId,
      { title, description, documentType, isPublic: isPublic === 'true' }
    );

    res.status(201).json({ success: true, document });
  } catch (error: any) {
    logger.error('Error uploading document', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/upload/meter-photo
 * @desc    Upload meter photo for OCR
 * @access  Private
 */
router.post('/upload/meter-photo', authenticateToken, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No photo provided' });
    }

    const userId = (req as any).user.id;

    const { url } = await uploadService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'meter-photos'
    );

    res.json({ success: true, url });
  } catch (error: any) {
    logger.error('Error uploading meter photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/upload/signed-url/:key
 * @desc    Get signed URL for file access
 * @access  Private
 */
router.get('/upload/signed-url/:key', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const signedUrl = await uploadService.getSignedUrl(key, 3600); // 1 hour
    res.json({ success: true, url: signedUrl });
  } catch (error: any) {
    logger.error('Error generating signed URL', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
