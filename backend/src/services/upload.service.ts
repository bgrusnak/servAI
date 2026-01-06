import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { AppDataSource } from '../db/data-source';
import { Document } from '../entities/Document';

export class UploadService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(path.join(this.uploadDir, 'documents'), { recursive: true });
      await fs.mkdir(path.join(this.uploadDir, 'meter-photos'), { recursive: true });
      await fs.mkdir(path.join(this.uploadDir, 'temp'), { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directories', { error });
    }
  }

  /**
   * Upload file to local storage
   */
  async uploadFile(
    file: Buffer,
    originalName: string,
    folder: string = 'temp'
  ): Promise<{ url: string; filepath: string }> {
    try {
      const fileExt = path.extname(originalName);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const filepath = path.join(this.uploadDir, folder, fileName);

      await fs.writeFile(filepath, file);

      const url = `/uploads/${folder}/${fileName}`;

      logger.info('File uploaded', { filepath, size: file.length });
      return { url, filepath };
    } catch (error) {
      logger.error('Failed to upload file', { error, originalName });
      throw error;
    }
  }

  /**
   * Delete file from local storage
   */
  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      logger.info('File deleted', { filepath });
    } catch (error) {
      logger.error('Failed to delete file', { error, filepath });
      throw error;
    }
  }

  /**
   * Upload document with metadata
   */
  async uploadDocument(
    file: Buffer,
    originalName: string,
    mimeType: string,
    condoId: string,
    uploadedBy: string,
    documentData: {
      title: string;
      description?: string;
      documentType: string;
      isPublic?: boolean;
    }
  ): Promise<Document> {
    try {
      const { url, filepath } = await this.uploadFile(
        file,
        originalName,
        `documents/${condoId}`
      );

      const documentRepo = AppDataSource.getRepository(Document);
      const document = documentRepo.create({
        condoId,
        uploadedBy,
        title: documentData.title,
        description: documentData.description,
        documentType: documentData.documentType,
        fileName: originalName,
        fileSize: file.length,
        fileUrl: url,
        filePath: filepath,
        mimeType,
        isPublic: documentData.isPublic || false,
      });

      await documentRepo.save(document);

      logger.info('Document uploaded', {
        documentId: document.id,
        condoId,
      });

      return document;
    } catch (error) {
      logger.error('Failed to upload document', { error, condoId });
      throw error;
    }
  }

  /**
   * Upload meter photo
   */
  async uploadMeterPhoto(
    file: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ url: string; filepath: string }> {
    return this.uploadFile(file, originalName, 'meter-photos');
  }

  /**
   * Get file path from URL
   */
  getFilePathFromUrl(url: string): string {
    const relativePath = url.replace('/uploads/', '');
    return path.join(this.uploadDir, relativePath);
  }
}

export const uploadService = new UploadService();
