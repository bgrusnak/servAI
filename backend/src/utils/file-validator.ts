import { logger } from './logger';

/**
 * Magic bytes (file signatures) for validation
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF87a or GIF89a
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header (need to check WEBP later)
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/zip': [[0x50, 0x4B, 0x03, 0x04]], // PK..
  'application/x-zip-compressed': [[0x50, 0x4B, 0x03, 0x04]],
};

/**
 * Validate file by checking magic bytes
 * Prevents malicious files with fake extensions
 */
export async function validateFileMagicBytes(
  buffer: Buffer,
  expectedMimeType: string
): Promise<boolean> {
  try {
    const signatures = MAGIC_BYTES[expectedMimeType];
    
    if (!signatures) {
      logger.warn('No magic bytes defined for MIME type', { expectedMimeType });
      return false;
    }
    
    // Check if buffer starts with any of the valid signatures
    const isValid = signatures.some(signature => {
      if (buffer.length < signature.length) {
        return false;
      }
      
      return signature.every((byte, index) => buffer[index] === byte);
    });
    
    if (!isValid) {
      logger.warn('File magic bytes do not match MIME type', {
        expectedMimeType,
        actualBytes: Array.from(buffer.slice(0, 16))
      });
    }
    
    return isValid;
  } catch (error) {
    logger.error('Error validating file magic bytes', { error });
    return false;
  }
}

/**
 * Get MIME type from magic bytes
 */
export function getMimeTypeFromMagicBytes(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(MAGIC_BYTES)) {
    const matches = signatures.some(signature => {
      if (buffer.length < signature.length) return false;
      return signature.every((byte, index) => buffer[index] === byte);
    });
    
    if (matches) {
      return mimeType;
    }
  }
  
  return null;
}
