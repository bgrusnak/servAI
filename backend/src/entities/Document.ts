import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Condo } from './Condo';
import { User } from './User';

@Entity('documents')
@Index('idx_documents_condo_id', ['condoId'])
@Index('idx_documents_uploaded_by', ['uploadedBy'])
@Index('idx_documents_document_type', ['documentType'])
@Index('idx_documents_is_public', ['isPublic'])
@Index('idx_documents_condo_type', ['condoId', 'documentType'])
@Index('idx_documents_created_at', ['createdAt'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condo_id' })
  condoId: string;

  @Column({ name: 'uploaded_by' })
  uploadedBy: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'document_type', length: 50 })
  documentType: string;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({ name: 'file_url' })
  fileUrl: string;

  @Column({ name: 'file_path' })
  filePath: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ name: 'is_public', default: false })
  isPublic: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Condo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condo_id' })
  condo: Condo;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
