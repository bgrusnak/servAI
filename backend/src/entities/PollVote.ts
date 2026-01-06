import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Poll } from './Poll';
import { PollOption } from './PollOption';
import { User } from './User';
import { Unit } from './Unit';

@Entity('poll_votes')
export class PollVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @Column({ name: 'poll_option_id', nullable: true })
  pollOptionId: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'is_abstain', default: false })
  isAbstain: boolean;

  @CreateDateColumn({ name: 'voted_at' })
  votedAt: Date;

  // Relations
  @ManyToOne(() => Poll, (poll) => poll.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;

  @ManyToOne(() => PollOption, (option) => option.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_option_id' })
  pollOption: PollOption | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
