import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Resident } from './Resident';
import { RefreshToken } from './RefreshToken';
import { AuditLog } from './AuditLog';
import { TelegramMessage } from './TelegramMessage';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'phone_number', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'telegram_id', type: 'bigint', nullable: true, unique: true })
  telegramId: string | null;

  @Column({ name: 'telegram_username', length: 100, nullable: true })
  telegramUsername: string | null;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Resident, (resident) => resident.user)
  residencies: Resident[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs: AuditLog[];

  @OneToMany(() => TelegramMessage, (message) => message.user)
  telegramMessages: TelegramMessage[];
}
