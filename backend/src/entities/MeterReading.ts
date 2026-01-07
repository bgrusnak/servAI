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
import { Meter } from './Meter';
import { User } from './User';

export enum ReadingSource {
  MANUAL = 'manual',
  OCR = 'ocr',
  AUTO = 'auto',
}

@Entity('meter_readings')
@Index('idx_meter_readings_meter_id', ['meterId'])
@Index('idx_meter_readings_user_id', ['userId'])
@Index('idx_meter_readings_reading_date', ['readingDate'])
@Index('idx_meter_readings_meter_date', ['meterId', 'readingDate'])
@Index('idx_meter_readings_is_verified', ['isVerified'])
export class MeterReading {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meter_id' })
  meterId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  value: number;

  @Column({ name: 'reading_date', type: 'date' })
  readingDate: Date;

  @Column({
    type: 'enum',
    enum: ReadingSource,
    default: ReadingSource.MANUAL,
  })
  source: ReadingSource;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'ocr_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  ocrConfidence: number | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_by', nullable: true })
  verifiedBy: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Meter, (meter) => meter.readings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meter_id' })
  meter: Meter;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifier: User | null;
}
