import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Unit } from './Unit';
import { Condo } from './Condo';
import { User } from './User';
import { TicketCategory } from './TicketCategory';
import { TicketComment } from './TicketComment';

export enum TicketStatus {
  NEW = 'new',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('tickets')
@Index('idx_tickets_unit_id', ['unitId'])
@Index('idx_tickets_condo_id', ['condoId'])
@Index('idx_tickets_created_by', ['createdBy'])
@Index('idx_tickets_assigned_to', ['assignedTo'])
@Index('idx_tickets_status', ['status'])
@Index('idx_tickets_priority', ['priority'])
@Index('idx_tickets_category_id', ['categoryId'])
@Index('idx_tickets_status_priority', ['status', 'priority'])
@Index('idx_tickets_condo_status', ['condoId', 'status'])
@Index('idx_tickets_created_at', ['createdAt'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'condo_id' })
  condoId: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.NEW,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  @Column({ name: 'assigned_to', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @ManyToOne(() => Condo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condo_id' })
  condo: Condo;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToOne(() => TicketCategory, (category) => category.tickets)
  @JoinColumn({ name: 'category_id' })
  category: TicketCategory;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignee: User | null;

  @OneToMany(() => TicketComment, (comment) => comment.ticket)
  comments: TicketComment[];
}
