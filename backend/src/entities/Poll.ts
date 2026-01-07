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
import { Condo } from './Condo';
import { User } from './User';
import { PollOption } from './PollOption';
import { PollVote } from './PollVote';

export enum PollType {
  SIMPLE = 'simple',
  MEETING = 'meeting',
  BUDGET = 'budget',
}

export enum PollStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Entity('polls')
@Index('idx_polls_condo_id', ['condoId'])
@Index('idx_polls_created_by', ['createdBy'])
@Index('idx_polls_status', ['status'])
@Index('idx_polls_poll_type', ['pollType'])
@Index('idx_polls_condo_status', ['condoId', 'status'])
@Index('idx_polls_end_date', ['endDate'])
export class Poll {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condo_id' })
  condoId: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'poll_type',
    type: 'enum',
    enum: PollType,
    default: PollType.SIMPLE,
  })
  pollType: PollType;

  @Column({ name: 'start_date', type: 'timestamp' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  endDate: Date;

  @Column({
    type: 'enum',
    enum: PollStatus,
    default: PollStatus.DRAFT,
  })
  status: PollStatus;

  @Column({ name: 'requires_quorum', default: false })
  requiresQuorum: boolean;

  @Column({ name: 'quorum_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  quorumPercent: number | null;

  @Column({ name: 'allow_multiple_choices', default: false })
  allowMultipleChoices: boolean;

  @Column({ name: 'allow_abstain', default: true })
  allowAbstain: boolean;

  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @Column({ name: 'total_votes', type: 'int', default: 0 })
  totalVotes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Condo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condo_id' })
  condo: Condo;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => PollOption, (option) => option.poll, { cascade: true })
  options: PollOption[];

  @OneToMany(() => PollVote, (vote) => vote.poll)
  votes: PollVote[];
}
