import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Unit } from './Unit';
import { MeterType } from './MeterType';
import { MeterReading } from './MeterReading';

@Entity('meters')
export class Meter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'meter_type_id' })
  meterTypeId: string;

  @Column({ name: 'serial_number', unique: true })
  serialNumber: string;

  @Column({ name: 'installation_date', type: 'date', nullable: true })
  installationDate: Date | null;

  @Column({ name: 'last_reading', type: 'decimal', precision: 10, scale: 3, nullable: true })
  lastReading: number | null;

  @Column({ name: 'last_reading_date', type: 'date', nullable: true })
  lastReadingDate: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Unit, (unit) => unit.meters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @ManyToOne(() => MeterType, (meterType) => meterType.meters)
  @JoinColumn({ name: 'meter_type_id' })
  meterType: MeterType;

  @OneToMany(() => MeterReading, (reading) => reading.meter)
  readings: MeterReading[];
}
