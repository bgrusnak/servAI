import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Unit } from './Unit';

export enum InviteRole {
  OWNER = 'owner',
  TENANT = 'tenant',
  FAMILY_MEMBER = 'family_member',
}

@Entity('invites')
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ unique: true })
  token: string;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: InviteRole,
    default: InviteRole.TENANT,
  })
  role: InviteRole;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
