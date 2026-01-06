import { AppDataSource } from '../db/data-source';
import { Ticket, TicketStatus } from '../entities/Ticket';
import { TicketComment } from '../entities/TicketComment';
import { logger } from '../utils/logger';

const ticketRepository = AppDataSource.getRepository(Ticket);
const ticketCommentRepository = AppDataSource.getRepository(TicketComment);

export class TicketService {
  /**
   * Create ticket
   */
  async createTicket(data: {
    unitId: string;
    condoId: string;
    createdBy: string;
    categoryId: string;
    title: string;
    description: string;
    priority?: string;
  }): Promise<Ticket> {
    try {
      const ticket = ticketRepository.create(data);
      await ticketRepository.save(ticket);

      logger.info('Ticket created', {
        ticketId: ticket.id,
        title: ticket.title,
      });

      return await this.getTicketById(ticket.id) as Ticket;
    } catch (error) {
      logger.error('Failed to create ticket', { error });
      throw error;
    }
  }

  /**
   * Get ticket by ID with comments
   */
  async getTicketById(ticketId: string): Promise<Ticket | null> {
    try {
      return await ticketRepository.findOne({
        where: { id: ticketId },
        relations: [
          'unit',
          'condo',
          'creator',
          'category',
          'assignee',
          'comments',
          'comments.user',
        ],
        order: {
          comments: {
            createdAt: 'ASC',
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get ticket', { error, ticketId });
      throw error;
    }
  }

  /**
   * Add comment to ticket
   */
  async addComment(
    ticketId: string,
    userId: string,
    comment: string,
    isInternal: boolean = false
  ): Promise<TicketComment> {
    try {
      const ticket = await ticketRepository.findOne({
        where: { id: ticketId },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      const ticketComment = ticketCommentRepository.create({
        ticketId,
        userId,
        comment,
        isInternal,
      });

      await ticketCommentRepository.save(ticketComment);

      logger.info('Comment added to ticket', { ticketId, userId });

      return ticketComment;
    } catch (error) {
      logger.error('Failed to add comment', { error, ticketId });
      throw error;
    }
  }

  /**
   * Update ticket status
   */
  async updateStatus(
    ticketId: string,
    status: TicketStatus,
    userId: string
  ): Promise<void> {
    try {
      const ticket = await ticketRepository.findOne({
        where: { id: ticketId },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      ticket.status = status;

      if (status === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      } else if (status === TicketStatus.CLOSED) {
        ticket.closedAt = new Date();
      }

      await ticketRepository.save(ticket);

      // Add system comment
      await this.addComment(
        ticketId,
        userId,
        `Status changed to ${status}`,
        true
      );

      logger.info('Ticket status updated', { ticketId, status });
    } catch (error) {
      logger.error('Failed to update ticket status', { error, ticketId });
      throw error;
    }
  }

  /**
   * Assign ticket to user
   */
  async assignTicket(ticketId: string, assignedTo: string): Promise<void> {
    try {
      const ticket = await ticketRepository.findOne({
        where: { id: ticketId },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      ticket.assignedTo = assignedTo;
      ticket.status = TicketStatus.IN_PROGRESS;

      await ticketRepository.save(ticket);

      logger.info('Ticket assigned', { ticketId, assignedTo });
    } catch (error) {
      logger.error('Failed to assign ticket', { error, ticketId });
      throw error;
    }
  }

  /**
   * Get tickets with filters
   */
  async getTickets(filter: {
    condoId?: string;
    unitId?: string;
    status?: TicketStatus;
    assignedTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tickets: Ticket[]; total: number }> {
    try {
      const where: any = {};

      if (filter.condoId) where.condoId = filter.condoId;
      if (filter.unitId) where.unitId = filter.unitId;
      if (filter.status) where.status = filter.status;
      if (filter.assignedTo) where.assignedTo = filter.assignedTo;

      const [tickets, total] = await ticketRepository.findAndCount({
        where,
        relations: ['unit', 'creator', 'category', 'assignee'],
        order: { createdAt: 'DESC' },
        take: filter.limit || 50,
        skip: filter.offset || 0,
      });

      return { tickets, total };
    } catch (error) {
      logger.error('Failed to get tickets', { error, filter });
      throw error;
    }
  }
}

export const ticketService = new TicketService();
