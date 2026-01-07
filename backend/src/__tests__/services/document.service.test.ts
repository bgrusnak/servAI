import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Document } from '../../entities/Document';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
} from '../utils/fixtures';

describe('Document Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let documentRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    documentRepo = testDataSource.getRepository(Document);
  });

  describe('Document Upload', () => {
    it('should upload a document', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const document = await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Meeting Protocol',
        description: 'Monthly meeting protocol',
        documentType: 'protocol',
        fileName: 'protocol-2026-01.pdf',
        fileSize: 1024000,
        fileUrl: '/uploads/documents/protocol-2026-01.pdf',
        filePath: '/app/uploads/documents/protocol-2026-01.pdf',
        mimeType: 'application/pdf',
        isPublic: true,
      });

      expect(document.id).toBeDefined();
      expect(document.title).toBe('Meeting Protocol');
      expect(document.isPublic).toBe(true);
    });

    it('should handle different document types', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const types = ['protocol', 'regulation', 'invoice', 'contract'];

      for (const type of types) {
        const document = await documentRepo.save({
          condoId: condo.id,
          uploadedBy: user.id,
          title: `${type} document`,
          documentType: type,
          fileName: `${type}.pdf`,
          fileSize: 1000,
          fileUrl: `/uploads/${type}.pdf`,
          filePath: `/app/uploads/${type}.pdf`,
          mimeType: 'application/pdf',
        });

        expect(document.documentType).toBe(type);
      }
    });
  });

  describe('Document Access', () => {
    it('should create public documents', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const document = await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Public Regulation',
        documentType: 'regulation',
        fileName: 'public.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/public.pdf',
        filePath: '/app/uploads/public.pdf',
        mimeType: 'application/pdf',
        isPublic: true,
      });

      expect(document.isPublic).toBe(true);
    });

    it('should create private documents', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const document = await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Private Contract',
        documentType: 'contract',
        fileName: 'private.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/private.pdf',
        filePath: '/app/uploads/private.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
      });

      expect(document.isPublic).toBe(false);
    });
  });

  describe('Document Search', () => {
    it('should find documents by type', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Protocol 1',
        documentType: 'protocol',
        fileName: 'p1.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/p1.pdf',
        filePath: '/app/uploads/p1.pdf',
        mimeType: 'application/pdf',
      });

      await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Protocol 2',
        documentType: 'protocol',
        fileName: 'p2.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/p2.pdf',
        filePath: '/app/uploads/p2.pdf',
        mimeType: 'application/pdf',
      });

      const protocols = await documentRepo.find({
        where: { condoId: condo.id, documentType: 'protocol' },
      });

      expect(protocols.length).toBe(2);
    });

    it('should find public documents only', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Public Doc',
        documentType: 'regulation',
        fileName: 'pub.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/pub.pdf',
        filePath: '/app/uploads/pub.pdf',
        mimeType: 'application/pdf',
        isPublic: true,
      });

      await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Private Doc',
        documentType: 'contract',
        fileName: 'priv.pdf',
        fileSize: 1000,
        fileUrl: '/uploads/priv.pdf',
        filePath: '/app/uploads/priv.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
      });

      const publicDocs = await documentRepo.find({
        where: { condoId: condo.id, isPublic: true },
      });

      expect(publicDocs.length).toBe(1);
      expect(publicDocs[0].isPublic).toBe(true);
    });
  });

  describe('File Metadata', () => {
    it('should store file size', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const document = await documentRepo.save({
        condoId: condo.id,
        uploadedBy: user.id,
        title: 'Large File',
        documentType: 'protocol',
        fileName: 'large.pdf',
        fileSize: 5242880, // 5MB
        fileUrl: '/uploads/large.pdf',
        filePath: '/app/uploads/large.pdf',
        mimeType: 'application/pdf',
      });

      expect(document.fileSize).toBe(5242880);
    });

    it('should store MIME type', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const mimeTypes = [
        { ext: 'pdf', mime: 'application/pdf' },
        { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { ext: 'jpg', mime: 'image/jpeg' },
      ];

      for (const type of mimeTypes) {
        const document = await documentRepo.save({
          condoId: condo.id,
          uploadedBy: user.id,
          title: `File.${type.ext}`,
          documentType: 'protocol',
          fileName: `file.${type.ext}`,
          fileSize: 1000,
          fileUrl: `/uploads/file.${type.ext}`,
          filePath: `/app/uploads/file.${type.ext}`,
          mimeType: type.mime,
        });

        expect(document.mimeType).toBe(type.mime);
      }
    });
  });
});
