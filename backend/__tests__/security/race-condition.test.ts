import { db } from '../../src/db';
import { InviteService } from '../../src/services/invite.service';
import { ResidentService } from '../../src/services/resident.service';

describe('Security: Race Condition Prevention', () => {
  let testUserId1: string;
  let testUserId2: string;
  let testUnitId: string;
  let inviteToken: string;

  beforeAll(async () => {
    // Create test users
    const user1 = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['race1@test.com', 'hash', 'Race', 'User1']
    );
    testUserId1 = user1.rows[0].id;

    const user2 = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['race2@test.com', 'hash', 'Race', 'User2']
    );
    testUserId2 = user2.rows[0].id;

    // Create minimal test structure
    const company = await db.query(
      `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      ['Race Test Co', testUserId1]
    );
    
    const condo = await db.query(
      `INSERT INTO condos (company_id, name, address, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [company.rows[0].id, 'Race Condo', 'Test St', testUserId1]
    );

    const building = await db.query(
      `INSERT INTO buildings (condo_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [condo.rows[0].id, 'Building', testUserId1]
    );

    const unitType = await db.query(
      `INSERT INTO unit_types (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id`,
      ['apartment']
    );

    const unit = await db.query(
      `INSERT INTO units (building_id, unit_type_id, number, floor, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [building.rows[0].id, unitType.rows[0].id, 'RACE-101', 1, testUserId1]
    );
    testUnitId = unit.rows[0].id;

    // Create invite
    const invite = await InviteService.createInvite({
      unit_id: testUnitId,
      created_by: testUserId1,
      max_uses: 1,
    });
    inviteToken = invite.token;
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM residents WHERE unit_id = $1', [testUnitId]);
    await db.query('DELETE FROM invites WHERE unit_id = $1', [testUnitId]);
    await db.query('DELETE FROM units WHERE id = $1', [testUnitId]);
    await db.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId1, testUserId2]);
  });

  describe('CRIT-001: Concurrent invite acceptance', () => {
    it('should allow only ONE user to accept invite with max_uses=1', async () => {
      const results = await Promise.allSettled([
        InviteService.acceptInvite(inviteToken, testUserId1),
        InviteService.acceptInvite(inviteToken, testUserId2),
      ]);

      // Exactly one should succeed, one should fail
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify only one resident was created
      const residents = await db.query(
        'SELECT COUNT(*) as count FROM residents WHERE unit_id = $1',
        [testUnitId]
      );
      expect(parseInt(residents.rows[0].count)).toBe(1);
    });
  });

  describe('CRIT-002: Duplicate resident prevention', () => {
    it('should prevent creating duplicate resident via concurrent calls', async () => {
      // Create new invite
      const newInvite = await InviteService.createInvite({
        unit_id: testUnitId,
        created_by: testUserId1,
        max_uses: 10,
      });

      // Try to create resident simultaneously
      const createPromises = Array(5).fill(null).map(() =>
        ResidentService.createResident({
          user_id: testUserId2,
          unit_id: testUnitId,
          is_owner: false,
        })
      );

      const results = await Promise.allSettled(createPromises);

      // Only one should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBe(1);

      // Verify only one resident exists
      const residents = await db.query(
        'SELECT COUNT(*) as count FROM residents WHERE user_id = $1 AND unit_id = $2',
        [testUserId2, testUnitId]
      );
      expect(parseInt(residents.rows[0].count)).toBe(1);
    });
  });

  describe('High concurrency stress test', () => {
    it('should handle 50 concurrent invite acceptance attempts gracefully', async () => {
      // Create invite with max_uses = 10
      const invite = await InviteService.createInvite({
        unit_id: testUnitId,
        created_by: testUserId1,
        max_uses: 10,
      });

      // Create 50 test users
      const userIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const user = await db.query(
          `INSERT INTO users (email, password_hash, first_name, last_name)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`stress${i}@test.com`, 'hash', 'Stress', `User${i}`]
        );
        userIds.push(user.rows[0].id);
      }

      // Try to accept invite simultaneously
      const acceptPromises = userIds.map(uid =>
        InviteService.acceptInvite(invite.token, uid)
      );

      const results = await Promise.allSettled(acceptPromises);

      // Exactly 10 should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBe(10);

      // Verify invite is deactivated
      const updatedInvite = await InviteService.getInviteById(invite.id);
      expect(updatedInvite?.is_active).toBe(false);
      expect(updatedInvite?.used_count).toBe(10);

      // Cleanup
      await db.query('DELETE FROM residents WHERE unit_id = $1', [testUnitId]);
      await db.query(
        'DELETE FROM users WHERE email LIKE $1',
        ['stress%@test.com']
      );
    }, 60000); // 60 second timeout for this heavy test
  });
});
