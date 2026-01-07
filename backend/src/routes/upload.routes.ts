import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadService } from '../services/upload.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import path from 'path';
import { Counter } from 'prom-client';

const router = Router();

// Role-based file size limits (in bytes)
const ROLE_SIZE_LIMITS = {
  resident: 5 * 1024 * 1024,      // 5MB
  security_guard: 10 * 1024 * 1024, // 10MB
  employee: 10 * 1024 * 1024,      // 10MB
  accountant: 20 * 1024 * 1024,    // 20MB
  complex_admin: 50 * 1024 * 1024, // 50MB
  uk_director: 50 * 1024 * 1024,   // 50MB
  superadmin: 100 * 1024 * 1024    // 100MB
};

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'];

// Security metrics
const uploadSecurityEvents = new Counter({
  name: 'upload_security_events_total',
  help: 'Security events in file upload',
  labelNames: ['event_type', 'severity']
});

/**
 * Validate file signature (magic bytes)
 */
function validateFileSignature(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // PNG: 89 50 4E 47
  if (mimetype === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && 
           buffer[2] === 0x4E && buffer[3] === 0x47;
  }

  // WebP: RIFF ... WEBP
  if (mimetype === 'image/webp') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && 
           buffer[2] === 0x46 && buffer[3] === 0x46 &&
           buffer[8] === 0x57 && buffer[9] === 0x45 && 
           buffer[10] === 0x42 && buffer[11] === 0x50;
  }

  // PDF: %PDF
  if (mimetype === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && 
           buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // DOC: D0 CF 11 E0 (Microsoft Office)
  if (mimetype === 'application/msword' || 
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // DOCX is actually a ZIP file: 50 4B 03 04
    if (mimetype.includes('openxmlformats')) {
      return buffer[0] === 0x50 && buffer[1] === 0x4B && 
             buffer[2] === 0x03 && buffer[3] === 0x04;
    }
    // Old DOC format
    return buffer[0] === 0xD0 && buffer[1] === 0xCF && 
           buffer[2] === 0x11 && buffer[3] === 0xE0;
  }

  return false;
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  if (!filename) {
    return `file_${Date.now()}`;
  }

  // Remove path separators and null bytes
  let sanitized = filename.replace(/[\/\\\x00]/g, '_');
  
  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }
  
  // Validate extension
  const ext = path.extname(sanitized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    uploadSecurityEvents.inc({ event_type: 'invalid_extension', severity: 'high' });
    throw new Error(`Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
  
  return sanitized;
}

/**
 * Get file size limit for user role
 */
function getFileSizeLimit(userRoles: any[]): number {
  if (!userRoles || userRoles.length === 0) {
    return ROLE_SIZE_LIMITS.resident;
  }

  // Get highest limit from user's roles
  let maxLimit = ROLE_SIZE_LIMITS.resident;
  for (const roleObj of userRoles) {
    const role = roleObj.role;
    if (ROLE_SIZE_LIMITS[role] && ROLE_SIZE_LIMITS[role] > maxLimit) {
      maxLimit = ROLE_SIZE_LIMITS[role];
    }
  }

  return maxLimit;
}

/**
 * Parse boolean value safely
 */
function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

// Configure multer for memory storage with dynamic limits
const createUpload = (req: any) => {
  const user = req.user;
  const fileLimit = getFileSizeLimit(user?.roles || []);

  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: fileLimit,
      files: 1 // Only one file at a time
    },
    fileFilter: (req, file, cb) => {
      // Basic MIME type check (will be verified by signature later)
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
        uploadSecurityEvents.inc({ event_type: 'invalid_mimetype', severity: 'medium' });
        cb(new Error('Invalid file type'));
      }
    }
  });
};

/**
 * @route   POST /api/v1/upload/document
 * @desc    Upload document
 * @access  Private
 */
router.post('/upload/document', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const upload = createUpload(req).single('file');

    upload(req, res, async (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const limit = getFileSizeLimit(user?.roles || []);
          return res.status(413).json({ 
            success: false, 
            error: `File too large. Max size: ${Math.round(limit / 1024 / 1024)}MB` 
          });
        }
        return res.status(400).json({ success: false, error: err.message });
      } else if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      // CRITICAL: Validate file signature (magic bytes)
      if (!validateFileSignature(req.file.buffer, req.file.mimetype)) {
        uploadSecurityEvents.inc({ event_type: 'signature_mismatch', severity: 'critical' });
        logger.warn('File signature mismatch detected', {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          userId: user?.id
        });
        return res.status(400).json({ 
          success: false, 
          error: 'File signature does not match declared type. Possible malware.' 
        });
      }

      const userId = user.id;
      const { condoId, title, description, documentType, isPublic } = req.body;

      if (!condoId || !title || !documentType) {
        return res.status(400).json({ 
          success: false, 
          error: 'condoId, title, and documentType are required' 
        });
      }

      // Sanitize filename
      let sanitizedFilename: string;
      try {
        sanitizedFilename = sanitizeFilename(req.file.originalname);
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error.message });
      }

      const document = await uploadService.uploadDocument(
        req.file.buffer,
        sanitizedFilename,
        req.file.mimetype,
        condoId,
        userId,
        { 
          title: title.trim(), 
          description: description?.trim(), 
          documentType, 
          isPublic: parseBoolean(isPublic)
        }
      );

      res.status(201).json({ success: true, document });
    });
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
router.post('/upload/meter-photo', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const upload = createUpload(req).single('photo');

    upload(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No photo provided' });
      }

      // CRITICAL: Validate file signature
      if (!validateFileSignature(req.file.buffer, req.file.mimetype)) {
        uploadSecurityEvents.inc({ event_type: 'signature_mismatch', severity: 'critical' });
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid image file' 
        });
      }

      // Only allow images for meter photos
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Only images allowed for meter photos' 
        });
      }

      const userId = user.id;

      // Sanitize filename
      const sanitizedFilename = sanitizeFilename(req.file.originalname);

      const { url } = await uploadService.uploadFile(
        req.file.buffer,
        sanitizedFilename,
        req.file.mimetype,
        'meter-photos'
      );

      res.json({ success: true, url });
    });
  } catch (error: any) {
    logger.error('Error uploading meter photo', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/upload/signed-url/:key
 * @desc    Get signed URL for file access
 * @access  Private
 * 
 * CRITICAL: Must verify user has access to this document!
 */
router.get('/upload/signed-url/:key', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const user = (req as any).user;

    // Validate key format (should be path like 'documents/uuid/filename')
    if (!key || key.includes('..') || key.includes('\0')) {
      uploadSecurityEvents.inc({ event_type: 'invalid_key', severity: 'high' });
      return res.status(400).json({ success: false, error: 'Invalid key' });
    }

    // CRITICAL: Verify user has access to this document
    // This requires checking document ownership/permissions in DB
    const hasAccess = await uploadService.verifyDocumentAccess(key, user.id, user.roles);
    
    if (!hasAccess) {
      uploadSecurityEvents.inc({ event_type: 'unauthorized_access', severity: 'high' });
      logger.warn('Unauthorized document access attempt', {
        userId: user.id,
        key,
        roles: user.roles
      });
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const signedUrl = await uploadService.getSignedUrl(key, 3600); // 1 hour
    res.json({ success: true, url: signedUrl });
  } catch (error: any) {
    logger.error('Error generating signed URL', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;