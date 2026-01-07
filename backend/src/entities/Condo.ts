import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './Company';
import { Building } from './Building';
import { Unit } from './Unit';

@Entity('condos')
export class Condo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'total_area', type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalArea: number | null;

  @Column({ name: 'built_year', type: 'int', nullable: true })
  builtYear: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Vehicle settings
  @Column({ name: 'max_vehicles_per_unit', type: 'int', default: 2 })
  maxVehiclesPerUnit: number;

  @Column({ name: 'temporary_pass_duration_hours', type: 'int', default: 24 })
  temporaryPassDurationHours: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // Relations
  @ManyToOne(() => Company, (company) => company.condos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Building, (building) => building.condo)
  buildings: Building[];

  @OneToMany(() => Unit, (unit) => unit.condo)
  units: Unit[];
}
