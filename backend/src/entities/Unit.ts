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
import { Resident } from './Resident';
import { Meter } from './Meter';
import { Invoice } from './Invoice';

export enum UnitType {
  APARTMENT = 'apartment',
  COMMERCIAL = 'commercial',
  PARKING = 'parking',
  STORAGE = 'storage',
}

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condo_id' })
  condoId: string;

  @Column({ name: 'entrance_id', nullable: true })
  entranceId: string | null;

  @Column({ length: 50 })
  number: string;

  @Column({ type: 'int', nullable: true })
  floor: number | null;

  @Column({
    type: 'enum',
    enum: UnitType,
    default: UnitType.APARTMENT,
  })
  type: UnitType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area: number | null;

  @Column({ type: 'int', nullable: true })
  rooms: number | null;

  @Column({ name: 'owner_name', nullable: true })
  ownerName: string | null;

  @Column({ name: 'owner_email', nullable: true })
  ownerEmail: string | null;

  @Column({ name: 'owner_phone', length: 20, nullable: true })
  ownerPhone: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // Relations
  @ManyToOne(() => Condo, (condo) => condo.units, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condo_id' })
  condo: Condo;

  @ManyToOne(() => Entrance, (entrance) => entrance.units, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'entrance_id' })
  entrance: Entrance | null;

  @OneToMany(() => Resident, (resident) => resident.unit)
  residents: Resident[];

  @OneToMany(() => Meter, (meter) => meter.unit)
  meters: Meter[];

  @OneToMany(() => Invoice, (invoice) => invoice.unit)
  invoices: Invoice[];
}
