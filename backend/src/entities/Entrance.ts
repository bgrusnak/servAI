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
import { Building } from './Building';
import { Unit } from './Unit';

@Entity('entrances')
export class Entrance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'building_id' })
  buildingId: string;

  @Column({ length: 50 })
  number: string;

  @Column({ name: 'floor_count', type: 'int', nullable: true })
  floorCount: number | null;

  @Column({ name: 'intercom_code', length: 20, nullable: true })
  intercomCode: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // Relations
  @ManyToOne(() => Building, (building) => building.entrances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @OneToMany(() => Unit, (unit) => unit.entrance)
  units: Unit[];
}
