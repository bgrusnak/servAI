import { InviteService } from '../../../src/services/invite.service';
import { db } from '../../../src/db';
import { AppError } from '../../../src/middleware/errorHandler';

jest.mock('../../../src/db');
jest.mock('../../../src/utils/logger');

describe('InviteService', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    it('should create invite with valid data', async () => {
      const mockUnitCheck = {
        rows: [{ id: 'unit-123', condo_id: 'condo-123' }],
      };

      const mockInvite = {
        rows: [{
          id: 'invite-123',
          unit_id: 'unit-123',
          token: expect.any(String),
          email: 'test@example.com',
          is_active: true,
          max_uses: 5,
          used_count: 0,
        }],
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockUnitCheck)
        .mockResolvedValueOnce(mockInvite);

      const result = await InviteService.createInvite({
        unit_id: 'unit-123',
        email: 'test@example.com',
        created_by: 'user-123',
        max_uses: 5,
      });

      expect(result).toEqual(mockInvite.rows[0]);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error if unit not found', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        InviteService.createInvite({
          unit_id: 'nonexistent',
          created_by: 'user-123',
        })
      ).rejects.toThrow(AppError);
    });

    it('should handle token collision gracefully', async () => {
      const mockUnitCheck = { rows: [{ id: 'unit-123' }] };
      const collisionError = {
        code: '23505',
        constraint: 'invites_token_key',
      };
      const mockSuccessInsert = {
        rows: [{ id: 'invite-123', token: 'new-token' }],
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockUnitCheck)
        .mockRejectedValueOnce(collisionError)
        .mockResolvedValueOnce(mockSuccessInsert);

      const result = await InviteService.createInvite({
        unit_id: 'unit-123',
        created_by: 'user-123',
      });

      expect(result.id).toBe('invite-123');
      expect(db.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('validateInvite', () => {
    it('should return valid for active non-expired invite', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const mockInvite = {
        rows: [{
          id: 'invite-123',
          token: 'test-token',
          is_active: true,
          expires_at: futureDate,
          max_uses: 5,
          used_count: 2,
          unit_number: '101',
        }],
      };

      (db.query as jest.Mock).mockResolvedValueOnce(mockInvite);

      const result = await InviteService.validateInvite('test-token');

      expect(result.valid).toBe(true);
      expect(result.invite).toBeDefined();
    });

    it('should return invalid for expired invite', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const mockInvite = {
        rows: [{
          id: 'invite-123',
          is_active: true,
          expires_at: pastDate,
          max_uses: 5,
          used_count: 2,
        }],
      };

      (db.query as jest.Mock).mockResolvedValueOnce(mockInvite);

      const result = await InviteService.validateInvite('expired-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invite has expired');
    });

    it('should return invalid for exhausted invite', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const mockInvite = {
        rows: [{
          id: 'invite-123',
          is_active: true,
          expires_at: futureDate,
          max_uses: 5,
          used_count: 5,
        }],
      };

      (db.query as jest.Mock).mockResolvedValueOnce(mockInvite);

      const result = await InviteService.validateInvite('exhausted-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invite has reached maximum uses');
    });

    it('should return invalid for inactive invite', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const mockInvite = {
        rows: [{
          id: 'invite-123',
          is_active: false,
          expires_at: futureDate,
          max_uses: 5,
          used_count: 0,
        }],
      };

      (db.query as jest.Mock).mockResolvedValueOnce(mockInvite);

      const result = await InviteService.validateInvite('inactive-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invite is no longer active');
    });

    it('should return invalid for non-existent invite', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await InviteService.validateInvite('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invite not found');
    });
  });

  describe('listInvitesByUnit - with pagination', () => {
    it('should return paginated results', async () => {
      const mockCount = { rows: [{ total: '50' }] };
      const mockData = {
        rows: Array(20).fill(null).map((_, i) => ({
          id: `invite-${i}`,
          unit_id: 'unit-123',
          token: `token-${i}`,
        })),
      };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockData);

      const result = await InviteService.listInvitesByUnit('unit-123', 1, 20);

      expect(result.data).toHaveLength(20);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(3);
    });

    it('should enforce maximum limit of 100', async () => {
      const mockCount = { rows: [{ total: '200' }] };
      const mockData = { rows: [] };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockData);

      await InviteService.listInvitesByUnit('unit-123', 1, 150);

      // Check that query was called with max 100
      const queryCall = (db.query as jest.Mock).mock.calls[1];
      expect(queryCall[1][1]).toBe(100); // limit parameter
    });

    it('should handle page 0 as page 1', async () => {
      const mockCount = { rows: [{ total: '10' }] };
      const mockData = { rows: [] };

      (db.query as jest.Mock)
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockData);

      const result = await InviteService.listInvitesByUnit('unit-123', 0, 10);

      expect(result.page).toBe(1);
    });
  });

  describe('getInviteStats', () => {
    it('should return correct statistics', async () => {
      const mockStats = {
        rows: [{
          total: '10',
          active: '5',
          expired: '3',
          exhausted: '2',
          total_uses: '15',
        }],
      };

      (db.query as jest.Mock).mockResolvedValueOnce(mockStats);

      const result = await InviteService.getInviteStats('unit-123');

      expect(result).toEqual({
        total: 10,
        active: 5,
        expired: 3,
        exhausted: 2,
        totalUses: 15,
      });
    });
  });
});
