import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Condo } from './Condo';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'legal_name', nullable: true })
  legalName: string | null;

  @Column({ length: 20, nullable: true })
  inn: string | null;

  @Column({ length: 20, nullable: true })
  kpp: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'contact_email', nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', length: 20, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'stripe_customer_id', nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Condo, (condo) => condo.company)
  condos: Condo[];
}
