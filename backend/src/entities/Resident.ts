import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { Unit } from './Unit';

export enum ResidentRole {
  OWNER = 'owner',
  TENANT = 'tenant',
  FAMILY_MEMBER = 'family_member',
}

@Entity('residents')
export class Resident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({
    type: 'enum',
    enum: ResidentRole,
    default: ResidentRole.TENANT,
  })
  role: ResidentRole;

  @Column({ name: 'move_in_date', type: 'date', nullable: true })
  moveInDate: Date | null;

  @Column({ name: 'move_out_date', type: 'date', nullable: true })
  moveOutDate: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.residencies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Unit, (unit) => unit.residents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
