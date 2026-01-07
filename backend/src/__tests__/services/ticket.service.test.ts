import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Ticket } from '../../entities/Ticket';
import { TicketCategory } from '../../entities/TicketCategory';
import { TicketComment } from '../../entities/TicketComment';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
  createTestUnit,
  createTestTicketCategory,
} from '../utils/fixtures';

describe('Ticket Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let ticketRepo: any;
  let ticketCategoryRepo: any;
  let ticketCommentRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    ticketRepo = testDataSource.getRepository(Ticket);
    ticketCategoryRepo = testDataSource.getRepository(TicketCategory);
    ticketCommentRepo = testDataSource.getRepository(TicketComment);
  });

  describe('Ticket Creation', () => {
    it('should create a support ticket', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);
      const category = await createTestTicketCategory(ticketCategoryRepo, {
        name: 'Maintenance',
      });

      const ticket = await ticketRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        createdBy: user.id,
        categoryId: category.id,
        title: 'Broken elevator',
        description: 'Elevator #2 is not working',
        status: 'new',
        priority: 'high',
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe('Broken elevator');
      expect(ticket.status).toBe('new');
      expect(ticket.priority).toBe('high');
    });

    it('should create ticket with different priorities', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);
      const category = await createTestTicketCategory(ticketCategoryRepo);

      const priorities = ['low', 'medium', 'high', 'urgent'];
      
      for (const priority of priorities) {
        const ticket = await ticketRepo.save({
          unitId: unit.id,
          condoId: condo.id,
          createdBy: user.id,
          categoryId: category.id,
          title: `${priority} priority ticket`,
          description: 'Test',
          status: 'new',
          priority,
        });

        expect(ticket.priority).toBe(priority);
      }
    });
  });

  describe('Ticket Assignment', () => {
    it('should assign ticket to user', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const creator = await createTestUser(userRepo, { email: 'creator@example.com' });
      const assignee = await createTestUser(userRepo, { email: 'worker@example.com' });
      const category = await createTestTicketCategory(ticketCategoryRepo);

      const ticket = await ticketRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        createdBy: creator.id,
        categoryId: category.id,
        title: 'Need assignment',
        description: 'This ticket needs assignment',
        status: 'new',
      });

      ticket.assignedTo = assignee.id;
      ticket.status = 'in_progress';
      const assigned = await ticketRepo.save(ticket);

      expect(assigned.assignedTo).toBe(assignee.id);
      expect(assigned.status).toBe('in_progress');
    });
  });

  describe('Ticket Comments', () => {
    it('should add comments to ticket', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);
      const category = await createTestTicketCategory(ticketCategoryRepo);

      const ticket = await ticketRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        createdBy: user.id,
        categoryId: category.id,
        title: 'Ticket with comments',
        description: 'Initial description',
        status: 'new',
      });

      const comments = [
        'We are looking into this issue',
        'Parts have been ordered',
        'Issue has been fixed',
      ];

      for (const commentText of comments) {
        await ticketCommentRepo.save({
          ticketId: ticket.id,
          userId: user.id,
          comment: commentText,
        });
      }

      const savedComments = await ticketCommentRepo.find({
        where: { ticketId: ticket.id },
        order: { createdAt: 'ASC' },
      });

      expect(savedComments.length).toBe(3);
      expect(savedComments[0].comment).toBe(comments[0]);
      expect(savedComments[2].comment).toBe(comments[2]);
    });
  });

  describe('Ticket Lifecycle', () => {
    it('should follow lifecycle: new -> in_progress -> resolved -> closed', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);
      const category = await createTestTicketCategory(ticketCategoryRepo);

      const ticket = await ticketRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        createdBy: user.id,
        categoryId: category.id,
        title: 'Lifecycle test',
        description: 'Testing ticket lifecycle',
        status: 'new',
      });

      expect(ticket.status).toBe('new');

      // Move to in_progress
      ticket.status = 'in_progress';
      ticket.assignedTo = user.id;
      let updated = await ticketRepo.save(ticket);
      expect(updated.status).toBe('in_progress');

      // Resolve
      ticket.status = 'resolved';
      ticket.resolvedAt = new Date();
      updated = await ticketRepo.save(ticket);
      expect(updated.status).toBe('resolved');
      expect(updated.resolvedAt).toBeDefined();

      // Close
      ticket.status = 'closed';
      ticket.closedAt = new Date();
      updated = await ticketRepo.save(ticket);
      expect(updated.status).toBe('closed');
      expect(updated.closedAt).toBeDefined();
    });
  });

  describe('Ticket Categories', () => {
    it('should create and use categories', async () => {
      const categories = [
        { name: 'Maintenance', color: '#FF0000' },
        { name: 'Plumbing', color: '#0000FF' },
        { name: 'Electrical', color: '#FFFF00' },
        { name: 'Cleaning', color: '#00FF00' },
      ];

      for (const catData of categories) {
        const category = await createTestTicketCategory(ticketCategoryRepo, catData);
        expect(category.name).toBe(catData.name);
        expect(category.color).toBe(catData.color);
      }

      const allCategories = await ticketCategoryRepo.find();
      expect(allCategories.length).toBeGreaterThanOrEqual(4);
    });
  });
});
