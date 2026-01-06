import { db } from '../../src/db';
import { InviteService } from '../../src/services/invite.service';
import { ResidentService } from '../../src/services/resident.service';

describe('Security: SQL Injection Prevention', () => {
  const sqlInjectionPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT * FROM users--",
    "admin'--",
    "' OR 1=1--",
    "1'; DELETE FROM invites WHERE '1'='1",
    "%27%20OR%201=1",
  ];

  describe('InviteService protection', () => {
    it('should safely handle SQL injection in getInviteByToken', async () => {
      for (const payload of sqlInjectionPayloads) {
        // Should not throw SQL error, should return null or handle gracefully
        const result = await InviteService.getInviteByToken(payload);
        expect(result).toBeNull();
      }
    });

    it('should safely handle SQL injection in validateInvite', async () => {
      for (const payload of sqlInjectionPayloads) {
        const result = await InviteService.validateInvite(payload);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Invite not found');
      }
    });
  });

  describe('Direct query protection', () => {
    it('should use parameterized queries for all user input', async () => {
      // Create test user
      const maliciousEmail = "admin'; DROP TABLE users; --@test.com";

      // This should safely insert the malicious string as data, not execute it
      const result = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING email`,
        [maliciousEmail, 'hash', 'Test', 'User']
      );

      // Email should be stored as-is (escaped)
      expect(result.rows[0].email).toBe(maliciousEmail);

      // Verify users table still exists (wasn't dropped)
      const usersExist = await db.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
      );
      expect(usersExist.rows[0].exists).toBe(true);

      // Cleanup
      await db.query('DELETE FROM users WHERE email = $1', [maliciousEmail]);
    });

    it('should prevent SQL injection in LIKE queries', async () => {
      const maliciousSearch = "%' OR '1'='1";

      // Search should not return all users
      const result = await db.query(
        `SELECT COUNT(*) as count FROM users WHERE email LIKE $1`,
        [`%${maliciousSearch}%`]
      );

      // Should return 0 (no matches) instead of all users
      expect(parseInt(result.rows[0].count)).toBe(0);
    });
  });

  describe('UUID validation', () => {
    it('should reject invalid UUID format', async () => {
      const invalidUUIDs = [
        "'; DROP TABLE users; --",
        "not-a-uuid",
        "12345",
        "<script>alert('xss')</script>",
      ];

      for (const invalidUUID of invalidUUIDs) {
        await expect(
          InviteService.getInviteById(invalidUUID)
        ).rejects.toThrow();
      }
    });
  });
});
