import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Vehicle } from './Vehicle';
import { Unit } from './Unit';

@Entity('vehicle_access_logs')
@Index('idx_access_logs_timestamp', ['timestamp'])
@Index('idx_access_logs_unit', ['unitId'])
@Index('idx_access_logs_vehicle', ['vehicleId'])
@Index('idx_access_logs_license_plate', ['licensePlate'])
export class VehicleAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ name: 'license_plate' })
  licensePlate: string;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'unit_number', nullable: true })
  unitNumber: string;

  @Column({ name: 'building_number', nullable: true })
  buildingNumber: string;

  @Column({ name: 'entrance_number', nullable: true })
  entranceNumber: string;

  @Column({ name: 'access_type' })
  accessType: 'permanent' | 'temporary' | 'unknown';

  @Column({ name: 'allowed', type: 'boolean' })
  allowed: boolean;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
