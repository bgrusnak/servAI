import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Poll } from './Poll';
import { PollVote } from './PollVote';

@Entity('poll_options')
export class PollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @Column({ name: 'option_text' })
  optionText: string;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;

  @Column({ name: 'vote_count', type: 'int', default: 0 })
  voteCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Poll, (poll) => poll.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;

  @OneToMany(() => PollVote, (vote) => vote.pollOption)
  votes: PollVote[];
}
