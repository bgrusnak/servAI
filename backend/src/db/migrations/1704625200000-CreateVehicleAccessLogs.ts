import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleAccessLogs1704625200000 implements MigrationInterface {
  name = 'CreateVehicleAccessLogs1704625200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vehicle_access_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vehicle_id UUID,
        license_plate VARCHAR(15) NOT NULL,
        unit_id UUID,
        unit_number VARCHAR(20),
        building_number VARCHAR(20),
        entrance_number VARCHAR(20),
        access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('permanent', 'temporary', 'unknown')),
        allowed BOOLEAN NOT NULL,
        expires_at TIMESTAMP,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON vehicle_access_logs(timestamp DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_logs_unit ON vehicle_access_logs(unit_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_logs_vehicle ON vehicle_access_logs(vehicle_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_logs_license_plate ON vehicle_access_logs(license_plate)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_access_logs_license_plate`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_access_logs_vehicle`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_access_logs_unit`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_access_logs_timestamp`);
    await queryRunner.query(`DROP TABLE IF EXISTS vehicle_access_logs`);
  }
}
