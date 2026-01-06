import { db } from '../../src/db';
import { InviteService } from '../../src/services/invite.service';
import { ResidentService } from '../../src/services/resident.service';
import { AuthService } from '../../src/services/auth.service';

describe('Race Condition Security Tests', () => {
  let testUnitId: string;
  let testUserId1: string;
  let testUserId2: string;
  let inviteToken: string;

  beforeAll(async () => {
    // Setup test data
    const companyResult = await db.query(
      `INSERT INTO companies (name) VALUES ('Race Test Company') RETURNING id`
    );
    const companyId = companyResult.rows[0].id;

    const condoResult = await db.query(
      `INSERT INTO condos (company_id, name, address) VALUES ($1, 'Race Test Condo', 'Test') RETURNING id`,
      [companyId]
    );
    const condoId = condoResult.rows[0].id;

    const unitTypeResult = await db.query(
      `INSERT INTO unit_types (name) VALUES ('test') RETURNING id`
    );
    const unitTypeId = unitTypeResult.rows[0].id;

    const unitResult = await db.query(
      `INSERT INTO units (condo_id, unit_type_id, number, floor) VALUES ($1, $2, '999', 1) RETURNING id`,
      [condoId, unitTypeId]
    );
    testUnitId = unitResult.rows[0].id;

    // Create users
    const hash = await AuthService.hashPassword('Test123!');
    const user1Result = await db.query(
      `INSERT INTO users (email, password_hash, first_name) VALUES ('race1@test.com', $1, 'User1') RETURNING id`,
      [hash]
    );
    testUserId1 = user1Result.rows[0].id;

    const user2Result = await db.query(
      `INSERT INTO users (email, password_hash, first_name) VALUES ('race2@test.com', $1, 'User2') RETURNING id`,
      [hash]
    );
    testUserId2 = user2Result.rows[0].id;

    // Create creator
    const creatorResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name) VALUES ('creator@test.com', $1, 'Creator') RETURNING id`,
      [hash]
    );
    const creatorId = creatorResult.rows[0].id;

    // Create invite
    const invite = await InviteService.createInvite({
      unit_id: testUnitId,
      created_by: creatorId,
      max_uses: 1,
    });
    inviteToken = invite.token;
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM residents WHERE unit_id = $1', [testUnitId]);
    await db.query('DELETE FROM invites WHERE unit_id = $1', [testUnitId]);
    await db.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
    await db.query('DELETE FROM units WHERE number = $1', ['999']);
  });

  describe('CRIT-001: Invite Acceptance Race Condition', () => {
    it('should prevent concurrent invite acceptance by different users', async () => {
      // Simulate two users trying to accept the same invite simultaneously
      const promises = [
        InviteService.acceptInvite(inviteToken, testUserId1),
        InviteService.acceptInvite(inviteToken, testUserId2),
      ];

      const results = await Promise.allSettled(promises);

      // One should succeed, one should fail
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // Verify only one resident was created
      const residentsResult = await db.query(
        'SELECT COUNT(*) as count FROM residents WHERE unit_id = $1 AND deleted_at IS NULL',
        [testUnitId]
      );

      expect(parseInt(residentsResult.rows[0].count)).toBe(1);

      // Verify invite counter is exactly 1
      const inviteResult = await db.query(
        'SELECT used_count FROM invites WHERE token = $1',
        [inviteToken]
      );

      expect(inviteResult.rows[0].used_count).toBe(1);
    });
  });

  describe('CRIT-002: Duplicate Resident Creation', () => {
    it('should prevent creating duplicate residents', async () => {
      const newUnitResult = await db.query(
        'SELECT id FROM units WHERE condo_id = (SELECT condo_id FROM units WHERE id = $1) AND number != $2 LIMIT 1',
        [testUnitId, '999']
      );

      if (newUnitResult.rows.length === 0) {
        // Create a new unit for this test
        const unitTypeId = await db.query(
          "SELECT id FROM unit_types WHERE name = 'test' LIMIT 1"
        );
        const condoId = await db.query(
          'SELECT condo_id FROM units WHERE id = $1',
          [testUnitId]
        );
        const newUnit = await db.query(
          'INSERT INTO units (condo_id, unit_type_id, number, floor) VALUES ($1, $2, $3, 1) RETURNING id',
          [condoId.rows[0].condo_id, unitTypeId.rows[0].id, '998']
        );
        newUnitResult.rows[0] = newUnit.rows[0];
      }

      const unitId = newUnitResult.rows[0].id;
      const userId = testUserId1;

      // Try to create same resident twice concurrently
      const promises = [
        ResidentService.createResident({ user_id: userId, unit_id: unitId }),
        ResidentService.createResident({ user_id: userId, unit_id: unitId }),
      ];

      const results = await Promise.allSettled(promises);

      // One should succeed, one should fail with 409 conflict
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // Verify error message
      if (failures[0].status === 'rejected') {
        expect(failures[0].reason.message).toContain('already an active resident');
      }

      // Verify only one resident exists
      const residentsResult = await db.query(
        'SELECT COUNT(*) as count FROM residents WHERE user_id = $1 AND unit_id = $2 AND deleted_at IS NULL',
        [userId, unitId]
      );

      expect(parseInt(residentsResult.rows[0].count)).toBe(1);
    });
  });
});
