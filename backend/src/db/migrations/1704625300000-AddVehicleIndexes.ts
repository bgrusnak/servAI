import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleIndexes1704625300000 implements MigrationInterface {
  name = 'AddVehicleIndexes1704625300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Vehicles table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vehicles_unit_id ON vehicles(unit_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON vehicles(created_at DESC)
    `);

    // Units table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_units_condo_id ON units(condo_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_units_building_id ON units(building_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_units_entrance_id ON units(entrance_id)
    `);

    // Residents table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_residents_user_id ON residents(user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_residents_unit_id ON residents(unit_id)
    `);

    // Condos table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_condos_company_id ON condos(company_id)
    `);

    // Users table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_condo_id ON users(condo_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)
    `);

    // Requests table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_unit_id ON requests(unit_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC)
    `);

    // Invoices table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_unit_id ON invoices(unit_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vehicles_unit_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vehicles_is_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vehicles_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_units_condo_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_units_building_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_units_entrance_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_residents_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_residents_unit_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_condos_company_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_company_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_condo_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_role`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_is_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_requests_unit_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_requests_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_requests_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_invoices_unit_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_invoices_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_invoices_due_date`);
  }
}
