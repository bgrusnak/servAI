import { AppDataSource } from '../db/data-source';
import { Poll, PollStatus } from '../entities/Poll';
import { PollOption } from '../entities/PollOption';
import { PollVote } from '../entities/PollVote';
import { logger } from '../utils/logger';

const pollRepository = AppDataSource.getRepository(Poll);
const pollOptionRepository = AppDataSource.getRepository(PollOption);
const pollVoteRepository = AppDataSource.getRepository(PollVote);

export class PollService {
  /**
   * Create poll with options
   */
  async createPoll(
    pollData: {
      condoId: string;
      createdBy: string;
      title: string;
      description?: string;
      pollType?: string;
      startDate: Date;
      endDate: Date;
      requiresQuorum?: boolean;
      quorumPercent?: number;
      allowMultipleChoices?: boolean;
      allowAbstain?: boolean;
      isAnonymous?: boolean;
    },
    options: Array<{ optionText: string }>
  ): Promise<Poll> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create poll
      const poll = pollRepository.create({
        ...pollData,
        status: PollStatus.ACTIVE,
      });

      await queryRunner.manager.save(poll);

      // Create options
      const pollOptions = options.map((opt, index) =>
        pollOptionRepository.create({
          pollId: poll.id,
          optionText: opt.optionText,
          displayOrder: index + 1,
        })
      );

      await queryRunner.manager.save(pollOptions);

      await queryRunner.commitTransaction();

      logger.info('Poll created', { pollId: poll.id, title: poll.title });

      return await this.getPollById(poll.id) as Poll;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to create poll', { error });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get poll by ID with options and votes
   */
  async getPollById(pollId: string): Promise<Poll | null> {
    try {
      return await pollRepository.findOne({
        where: { id: pollId },
        relations: ['options', 'options.votes', 'creator'],
      });
    } catch (error) {
      logger.error('Failed to get poll', { error, pollId });
      throw error;
    }
  }

  /**
   * Vote on poll
   */
  async vote(
    pollId: string,
    userId: string,
    unitId: string,
    optionId?: string,
    isAbstain: boolean = false
  ): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const poll = await pollRepository.findOne({
        where: { id: pollId },
      });

      if (!poll) {
        throw new Error('Poll not found');
      }

      if (poll.status !== PollStatus.ACTIVE) {
        throw new Error('Poll is not active');
      }

      // Check if already voted
      const existingVote = await pollVoteRepository.findOne({
        where: { pollId, userId },
      });

      if (existingVote) {
        throw new Error('Already voted');
      }

      // Create vote
      const vote = pollVoteRepository.create({
        pollId,
        userId,
        unitId,
        pollOptionId: optionId || null,
        isAbstain,
      });

      await queryRunner.manager.save(vote);

      // Update vote counts
      poll.totalVotes += 1;
      await queryRunner.manager.save(poll);

      if (optionId && !isAbstain) {
        await queryRunner.manager.increment(
          PollOption,
          { id: optionId },
          'voteCount',
          1
        );
      }

      await queryRunner.commitTransaction();

      logger.info('Vote recorded', { pollId, userId, optionId });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to vote', { error, pollId });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Close expired polls
   */
  async closeExpiredPolls(): Promise<number> {
    try {
      const result = await pollRepository
        .createQueryBuilder()
        .update(Poll)
        .set({ status: PollStatus.CLOSED })
        .where('end_date < :now', { now: new Date() })
        .andWhere('status = :status', { status: PollStatus.ACTIVE })
        .execute();

      logger.info('Closed expired polls', { count: result.affected });
      return result.affected || 0;
    } catch (error) {
      logger.error('Failed to close expired polls', { error });
      throw error;
    }
  }
}

export const pollService = new PollService();
