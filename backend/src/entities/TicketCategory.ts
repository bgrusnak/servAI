import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Ticket } from './Ticket';

@Entity('ticket_categories')
export class TicketCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'icon_name', length: 50, nullable: true })
  iconName: string | null;

  @Column({ name: 'sla_hours', type: 'int', nullable: true })
  slaHours: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Ticket, (ticket) => ticket.category)
  tickets: Ticket[];
}
