import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { pollService } from '../services/poll.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/v1/polls
 * @desc    Create new poll
 * @access  Private (Admin only)
 */
router.post('/polls', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { 
      condoId, title, description, pollType, startDate, endDate,
      requiresQuorum, quorumPercent, allowMultipleChoices, 
      allowAbstain, isAnonymous, options 
    } = req.body;

    if (!condoId || !title || !startDate || !endDate || !options || options.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields or insufficient options' 
      });
    }

    const poll = await pollService.createPoll({
      condoId,
      createdBy: userId,
      title,
      description,
      pollType,
      startDate,
      endDate,
      requiresQuorum,
      quorumPercent,
      allowMultipleChoices,
      allowAbstain,
      isAnonymous
    }, options);

    res.status(201).json({ success: true, poll });
  } catch (error: any) {
    logger.error('Error creating poll', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/polls/:pollId
 * @desc    Get poll details with results
 * @access  Private
 */
router.get('/polls/:pollId', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const poll = await pollService.getPollById(pollId);

    if (!poll) {
      return res.status(404).json({ success: false, error: 'Poll not found' });
    }

    res.json({ success: true, poll });
  } catch (error: any) {
    logger.error('Error fetching poll', { error, pollId: req.params.pollId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/polls/:pollId/vote
 * @desc    Vote on poll
 * @access  Private
 */
router.post('/polls/:pollId/vote', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = (req as any).user.id;
    const { unitId, optionId, isAbstain } = req.body;

    if (!unitId) {
      return res.status(400).json({ 
        success: false, 
        error: 'unitId is required' 
      });
    }

    if (!optionId && !isAbstain) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either optionId or isAbstain must be provided' 
      });
    }

    await pollService.vote(pollId, userId, unitId, optionId, isAbstain);
    res.json({ success: true, message: 'Vote recorded' });
  } catch (error: any) {
    logger.error('Error voting on poll', { error, pollId: req.params.pollId });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
