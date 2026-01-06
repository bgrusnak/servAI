import { InviteService } from '../../../src/services/invite.service';
import { db } from '../../../src/db';
import { AppError } from '../../../src/middleware/errorHandler';

// Mock database
jest.mock('../../../src/db');

describe('InviteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateInvite', () => {
    it('should return valid for active non-expired invite', async () => {
      const mockInvite = {
        id: 'invite-id',
        token: 'valid-token',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000), // tomorrow
        max_uses: 10,
        used_count: 5,
        unit_id: 'unit-id',
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockInvite] });

      const result = await InviteService.validateInvite('valid-token');

      expect(result.valid).toBe(true);
      expect(result.invite).toBeDefined();
    });

    it('should return invalid for non-existent invite', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await InviteService.validateInvite('nonexistent-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invite not found');
    });

    it('should return invalid for inactive invite', async () => {
      const mockInvite = {
        id: 'invite-id',
        is_active: false,
        expires_at: new Date(Date.now() + 86400000),
        max_uses: null,
        used_count: 0,
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockInvite] });

      const result = await InviteService.validateInvite('inactive-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('no longer active');
    });

    it('should return invalid for expired invite', async () => {
      const mockInvite = {
        id: 'invite-id',
        is_active: true,
        expires_at: new Date(Date.now() - 86400000), // yesterday
        max_uses: null,
        used_count: 0,
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockInvite] });

      const result = await InviteService.validateInvite('expired-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should return invalid when max uses reached', async () => {
      const mockInvite = {
        id: 'invite-id',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000),
        max_uses: 5,
        used_count: 5,
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockInvite] });

      const result = await InviteService.validateInvite('maxed-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('maximum uses');
    });

    it('should return valid when max_uses is null (unlimited)', async () => {
      const mockInvite = {
        id: 'invite-id',
        is_active: true,
        expires_at: new Date(Date.now() + 86400000),
        max_uses: null,
        used_count: 1000,
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockInvite] });

      const result = await InviteService.validateInvite('unlimited-token');

      expect(result.valid).toBe(true);
    });
  });
});
