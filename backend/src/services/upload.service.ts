import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import path from 'path';

const s3Client = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  endpoint: config.s3.endpoint, // For MinIO compatibility
  forcePathStyle: true, // Required for MinIO
});

export class UploadService {
  /**
   * Upload file to S3/MinIO
   */
  async uploadFile(file: Buffer, originalName: string, mimeType: string, folder: string = 'uploads'): Promise<{ url: string; key: string }> {
    try {
      const fileExt = path.extname(originalName);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const key = `${folder}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
        ACL: 'private',
      });

      await s3Client.send(command);

      const url = `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
      
      logger.info('File uploaded', { key, size: file.length });
      return { url, key };
    } catch (error) {
      logger.error('Failed to upload file', { error, originalName });
      throw error;
    }
  }

  /**
   * Delete file from S3/MinIO
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      });

      await s3Client.send(command);
      logger.info('File deleted', { key });
    } catch (error) {
      logger.error('Failed to delete file', { error, key });
      throw error;
    }
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      logger.error('Failed to generate signed URL', { error, key });
      throw error;
    }
  }

  /**
   * Upload document
   */
  async uploadDocument(file: Buffer, originalName: string, mimeType: string, condoId: string, uploadedBy: string, documentData: any): Promise<any> {
    try {
      const { url, key } = await this.uploadFile(file, originalName, mimeType, `documents/${condoId}`);

      const result = await pool.query(
        `INSERT INTO documents (
          condo_id, uploaded_by, title, description, document_type,
          file_name, file_size, file_url, mime_type, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          condoId,
          uploadedBy,
          documentData.title,
          documentData.description || null,
          documentData.documentType,
          originalName,
          file.length,
          url,
          mimeType,
          documentData.isPublic || false
        ]
      );

      logger.info('Document uploaded', { 
        documentId: result.rows[0].id, 
        condoId 
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to upload document', { error, condoId });
      throw error;
    }
  }
}

export const uploadService = new UploadService();

// Import pool
import { pool } from '../db';
