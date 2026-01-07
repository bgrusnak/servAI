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
import { Unit } from './Unit';

@Entity('vehicles')
@Index('idx_vehicles_unit_id', ['unitId'])
@Index('idx_vehicles_is_active', ['isActive'])
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'license_plate', unique: true })
  licensePlate: string;

  @Column({ nullable: true })
  make: string | null;

  @Column({ nullable: true })
  model: string | null;

  @Column({ nullable: true })
  color: string | null;

  @Column({ name: 'parking_spot', nullable: true })
  parkingSpot: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
