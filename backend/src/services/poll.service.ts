import { pool } from '../db';
import { logger } from '../utils/logger';

interface Poll {
  id?: string;
  condoId: string;
  createdBy: string;
  title: string;
  description?: string;
  pollType?: string;
  startDate: string;
  endDate: string;
  requiresQuorum?: boolean;
  quorumPercent?: number;
  allowMultipleChoices?: boolean;
  allowAbstain?: boolean;
  isAnonymous?: boolean;
}

interface PollOption {
  optionText: string;
  displayOrder?: number;
}

export class PollService {
  /**
   * Create poll with options
   */
  async createPoll(poll: Poll, options: PollOption[]): Promise<any> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create poll
      const pollResult = await client.query(
        `INSERT INTO polls (
          condo_id, created_by, title, description, poll_type,
          start_date, end_date, requires_quorum, quorum_percent,
          allow_multiple_choices, allow_abstain, is_anonymous
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          poll.condoId, poll.createdBy, poll.title, poll.description || null,
          poll.pollType || 'simple', poll.startDate, poll.endDate,
          poll.requiresQuorum || false, poll.quorumPercent || null,
          poll.allowMultipleChoices || false, poll.allowAbstain || true,
          poll.isAnonymous || false
        ]
      );
      
      const pollId = pollResult.rows[0].id;
      
      // Add options
      for (let i = 0; i < options.length; i++) {
        await client.query(
          `INSERT INTO poll_options (poll_id, option_text, display_order)
           VALUES ($1, $2, $3)`,
          [pollId, options[i].optionText, options[i].displayOrder || i]
        );
      }
      
      await client.query('COMMIT');
      logger.info('Poll created', { pollId, title: poll.title });
      
      return pollResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create poll', { error, poll });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Vote on poll
   */
  async vote(pollId: string, userId: string, unitId: string, optionId?: string, isAbstain?: boolean): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO poll_votes (poll_id, option_id, user_id, unit_id, is_abstain)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (poll_id, user_id, unit_id) DO UPDATE
         SET option_id = EXCLUDED.option_id, is_abstain = EXCLUDED.is_abstain, voted_at = NOW()`,
        [pollId, optionId || null, userId, unitId, isAbstain || false]
      );
      
      // Update votes count
      if (optionId) {
        await pool.query(
          `UPDATE poll_options 
           SET votes_count = (SELECT COUNT(*) FROM poll_votes WHERE option_id = $1)
           WHERE id = $1`,
          [optionId]
        );
      }
      
      logger.info('Vote recorded', { pollId, userId, optionId });
    } catch (error) {
      logger.error('Failed to record vote', { error, pollId, userId });
      throw error;
    }
  }

  /**
   * Get poll with results
   */
  async getPollById(pollId: string): Promise<any> {
    const pollResult = await pool.query(
      `SELECT p.*, u.first_name, u.last_name
       FROM polls p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [pollId]
    );
    
    if (pollResult.rows.length === 0) {
      return null;
    }
    
    const poll = pollResult.rows[0];
    
    const optionsResult = await pool.query(
      `SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY display_order`,
      [pollId]
    );
    
    const votesResult = await pool.query(
      `SELECT COUNT(*) as total FROM poll_votes WHERE poll_id = $1`,
      [pollId]
    );
    
    return {
      ...poll,
      options: optionsResult.rows,
      totalVotes: parseInt(votesResult.rows[0].total)
    };
  }
}

export const pollService = new PollService();
