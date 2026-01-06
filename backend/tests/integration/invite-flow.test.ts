import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/db';
import { AuthService } from '../../src/services/auth.service';

describe('Invite Flow Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let companyId: string;
  let condoId: string;
  let unitId: string;
  let adminUserId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // Create test company
    const companyResult = await db.query(
      `INSERT INTO companies (name) VALUES ('Test Company') RETURNING id`
    );
    companyId = companyResult.rows[0].id;

    // Create test condo
    const condoResult = await db.query(
      `INSERT INTO condos (company_id, name, address) 
       VALUES ($1, 'Test Condo', 'Test Address') RETURNING id`,
      [companyId]
    );
    condoId = condoResult.rows[0].id;

    // Create unit type
    const unitTypeResult = await db.query(
      `INSERT INTO unit_types (name) VALUES ('apartment') RETURNING id`
    );
    const unitTypeId = unitTypeResult.rows[0].id;

    // Create test unit
    const unitResult = await db.query(
      `INSERT INTO units (condo_id, unit_type_id, number, floor) 
       VALUES ($1, $2, '101', 1) RETURNING id`,
      [condoId, unitTypeId]
    );
    unitId = unitResult.rows[0].id;

    // Create admin user
    const adminPasswordHash = await AuthService.hashPassword('AdminPass123!');
    const adminResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name) 
       VALUES ('admin@test.com', $1, 'Admin', 'User') RETURNING id`,
      [adminPasswordHash]
    );
    adminUserId = adminResult.rows[0].id;

    // Give admin role
    await db.query(
      `INSERT INTO user_roles (user_id, role, condo_id) VALUES ($1, 'condo_admin', $2)`,
      [adminUserId, condoId]
    );

    // Create regular user
    const userPasswordHash = await AuthService.hashPassword('UserPass123!');
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name) 
       VALUES ('user@test.com', $1, 'Regular', 'User') RETURNING id`,
      [userPasswordHash]
    );
    regularUserId = userResult.rows[0].id;

    // Generate tokens
    const adminTokenPair = await AuthService.createTokenPair(adminUserId);
    adminToken = adminTokenPair.accessToken;

    const userTokenPair = await AuthService.createTokenPair(regularUserId);
    userToken = userTokenPair.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM user_roles WHERE user_id IN ($1, $2)', [adminUserId, regularUserId]);
    await db.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUserId, regularUserId]);
    await db.query('DELETE FROM invites WHERE unit_id = $1', [unitId]);
    await db.query('DELETE FROM residents WHERE unit_id = $1', [unitId]);
    await db.query('DELETE FROM units WHERE id = $1', [unitId]);
    await db.query('DELETE FROM condos WHERE id = $1', [condoId]);
    await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
  });

  describe('Complete Invite Flow', () => {
    let inviteToken: string;

    it('1. Admin should create invite for unit', async () => {
      const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit_id: unitId,
          max_uses: 1,
          ttl_days: 7,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.unit_id).toBe(unitId);
      expect(response.body.is_active).toBe(true);

      inviteToken = response.body.token;
    });

    it('2. Anyone should validate invite (no auth required)', async () => {
      const response = await request(app)
        .get(`/api/invites/validate/${inviteToken}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.invite).toBeDefined();
      expect(response.body.invite.unit_number).toBe('101');
    });

    it('3. User should accept invite and become resident', async () => {
      const response = await request(app)
        .post(`/api/invites/accept/${inviteToken}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('accepted successfully');
      expect(response.body.resident).toBeDefined();
      expect(response.body.unit.number).toBe('101');
    });

    it('4. Same user should not be able to accept again (duplicate prevention)', async () => {
      const response = await request(app)
        .post(`/api/invites/accept/${inviteToken}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already an active resident');
    });

    it('5. Verify user has resident role', async () => {
      const roleResult = await db.query(
        `SELECT * FROM user_roles 
         WHERE user_id = $1 AND condo_id = $2 AND role = 'resident' AND is_active = true`,
        [regularUserId, condoId]
      );

      expect(roleResult.rows.length).toBe(1);
    });

    it('6. Verify invite usage counter incremented', async () => {
      const inviteResult = await db.query(
        `SELECT used_count, is_active FROM invites WHERE token = $1`,
        [inviteToken]
      );

      expect(inviteResult.rows[0].used_count).toBe(1);
      expect(inviteResult.rows[0].is_active).toBe(false); // Auto-deactivated at max_uses
    });

    it('7. Invite should now be invalid (max uses reached)', async () => {
      const response = await request(app)
        .get(`/api/invites/validate/${inviteToken}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toContain('no longer active');
    });
  });

  describe('Invite Access Control', () => {
    it('Regular user should NOT be able to create invites', async () => {
      const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          unit_id: unitId,
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Insufficient permissions');
    });

    it('Should require authentication to accept invite', async () => {
      const response = await request(app)
        .post('/api/invites/accept/some-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Invite Validation', () => {
    it('Should reject invite with invalid unit_id format', async () => {
      const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit_id: 'not-a-uuid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation error');
    });

    it('Should reject invite with invalid ttl_days', async () => {
      const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit_id: unitId,
          ttl_days: -1, // Invalid
        });

      expect(response.status).toBe(400);
    });

    it('Should reject invite with invalid email', async () => {
      const response = await request(app)
        .post('/api/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit_id: unitId,
          email: 'not-an-email',
        });

      expect(response.status).toBe(400);
    });
  });
});
