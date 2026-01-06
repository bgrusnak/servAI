import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/db';
import { sign } from 'jsonwebtoken';
import { config } from '../../src/config';

describe('Invite Flow Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let companyId: string;
  let condoId: string;
  let buildingId: string;
  let unitId: string;
  let inviteToken: string;

  beforeAll(async () => {
    // Create test user
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['test@example.com', 'hashed_password', 'Test', 'User']
    );
    userId = userResult.rows[0].id;

    // Generate JWT
    authToken = sign({ id: userId, email: 'test@example.com' }, config.jwt.secret, {
      expiresIn: '1h',
    });

    // Create test company
    const companyResult = await db.query(
      `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
      ['Test Company', userId]
    );
    companyId = companyResult.rows[0].id;

    // Create condo
    const condoResult = await db.query(
      `INSERT INTO condos (company_id, name, address, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, 'Test Condo', '123 Test St', userId]
    );
    condoId = condoResult.rows[0].id;

    // Create building
    const buildingResult = await db.query(
      `INSERT INTO buildings (condo_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [condoId, 'Building A', userId]
    );
    buildingId = buildingResult.rows[0].id;

    // Get a unit type
    const unitTypeResult = await db.query(
      `INSERT INTO unit_types (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = $1 RETURNING id`,
      ['apartment']
    );
    const unitTypeId = unitTypeResult.rows[0].id;

    // Create unit
    const unitResult = await db.query(
      `INSERT INTO units (building_id, unit_type_id, number, floor, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [buildingId, unitTypeId, '101', 1, userId]
    );
    unitId = unitResult.rows[0].id;

    // Create user role (company admin)
    await db.query(
      `INSERT INTO user_roles (user_id, company_id, role, created_by)
       VALUES ($1, $2, $3, $4)`,
      [userId, companyId, 'company_admin', userId]
    );
  });

  afterAll(async () => {
    // Cleanup test data
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM invites WHERE unit_id = $1', [unitId]);
    await db.query('DELETE FROM residents WHERE unit_id = $1', [unitId]);
    await db.query('DELETE FROM units WHERE id = $1', [unitId]);
    await db.query('DELETE FROM buildings WHERE id = $1', [buildingId]);
    await db.query('DELETE FROM condos WHERE id = $1', [condoId]);
    await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  describe('Complete invite flow', () => {
    it('should create invite for unit', async () => {
      const response = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unit_id: unitId,
          email: 'newresident@example.com',
          max_uses: 1,
          ttl_days: 7,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('token');
      expect(response.body.unit_id).toBe(unitId);
      expect(response.body.max_uses).toBe(1);

      inviteToken = response.body.token;
    });

    it('should validate invite token', async () => {
      const response = await request(app)
        .get(`/api/v1/invites/validate/${inviteToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.invite).toHaveProperty('unit_number');
      expect(response.body.invite).toHaveProperty('condo_name');
    });

    it('should accept invite and create resident', async () => {
      // Create another user to accept the invite
      const newUserResult = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ['newresident@example.com', 'hashed_password', 'New', 'Resident']
      );
      const newUserId = newUserResult.rows[0].id;

      const newUserToken = sign(
        { id: newUserId, email: 'newresident@example.com' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post(`/api/v1/invites/accept/${inviteToken}`)
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('resident');
      expect(response.body).toHaveProperty('unit');
      expect(response.body.resident.user_id).toBe(newUserId);
      expect(response.body.resident.unit_id).toBe(unitId);

      // Cleanup
      await db.query('DELETE FROM residents WHERE user_id = $1', [newUserId]);
      await db.query('DELETE FROM users WHERE id = $1', [newUserId]);
    });

    it('should not allow duplicate invite acceptance', async () => {
      const newUserResult = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ['duplicate@example.com', 'hashed_password', 'Dup', 'User']
      );
      const dupUserId = newUserResult.rows[0].id;

      const dupToken = sign(
        { id: dupUserId, email: 'duplicate@example.com' },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      // Create new invite
      const inviteResponse = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unit_id: unitId,
          max_uses: 2,
        })
        .expect(201);

      const dupInviteToken = inviteResponse.body.token;

      // Accept first time - should succeed
      await request(app)
        .post(`/api/v1/invites/accept/${dupInviteToken}`)
        .set('Authorization', `Bearer ${dupToken}`)
        .expect(201);

      // Try to accept again - should fail (already resident)
      await request(app)
        .post(`/api/v1/invites/accept/${dupInviteToken}`)
        .set('Authorization', `Bearer ${dupToken}`)
        .expect(409); // Conflict - already resident

      // Cleanup
      await db.query('DELETE FROM residents WHERE user_id = $1', [dupUserId]);
      await db.query('DELETE FROM users WHERE id = $1', [dupUserId]);
    });
  });

  describe('List invites with pagination', () => {
    it('should return paginated invite list', async () => {
      const response = await request(app)
        .get(`/api/v1/invites/unit/${unitId}?page=1&limit=10`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('totalPages');
    });
  });

  describe('Input validation', () => {
    it('should reject invalid email format', async () => {
      await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unit_id: unitId,
          email: 'invalid-email',
        })
        .expect(400);
    });

    it('should reject invalid phone format', async () => {
      await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unit_id: unitId,
          phone: 'abc123',
        })
        .expect(400);
    });

    it('should reject invalid UUID', async () => {
      await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unit_id: 'not-a-uuid',
        })
        .expect(400);
    });
  });
});
