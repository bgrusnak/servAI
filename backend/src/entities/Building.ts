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
import { Condo } from './Condo';
import { Entrance } from './Entrance';

@Entity('buildings')
export class Building {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condo_id' })
  condoId: string;

  @Column({ length: 50 })
  number: string;

  @Column({ name: 'street_address', nullable: true })
  streetAddress: string | null;

  @Column({ name: 'floor_count', type: 'int', nullable: true })
  floorCount: number | null;

  @Column({ name: 'entrance_count', type: 'int', nullable: true })
  entranceCount: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // Relations
  @ManyToOne(() => Condo, (condo) => condo.buildings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condo_id' })
  condo: Condo;

  @OneToMany(() => Entrance, (entrance) => entrance.building)
  entrances: Entrance[];
}
