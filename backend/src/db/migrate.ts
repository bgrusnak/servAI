import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { db } from './index';
import { logger } from '../utils/logger';

interface Migration {
  id: number;
  name: string;
  executed_at: Date;
}

async function createMigrationsTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations(): Promise<Migration[]> {
  const result = await db.query<Migration>(
    'SELECT id, name, executed_at FROM migrations ORDER BY id'
  );
  return result.rows;
}

async function executeMigration(name: string, sql: string): Promise<void> {
  await db.transaction(async (client) => {
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [name]
      );
      logger.info(`✓ Migration executed successfully: ${name}`);
    } catch (error) {
      logger.error(`✗ Migration failed: ${name}`, { error });
      throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
}

async function runMigrations(): Promise<void> {
  try {
    logger.info('=== Starting database migrations ===');
    
    await createMigrationsTable();
    
    const executedMigrations = await getExecutedMigrations();
    const executedNames = new Set(executedMigrations.map(m => m.name));
    
    logger.info(`Already executed migrations: ${executedMigrations.length}`);
    
    const migrationsDir = join(__dirname, 'migrations');
    let files: string[];
    
    try {
      files = await readdir(migrationsDir);
    } catch (error) {
      logger.warn('Migrations directory not found, skipping migrations');
      return;
    }
    
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    const pendingMigrations = migrationFiles.filter(f => !executedNames.has(f));
    
    if (pendingMigrations.length === 0) {
      logger.info('✓ No new migrations to execute');
      logger.info('=== Migrations completed ===');
      return;
    }
    
    logger.info(`Found ${pendingMigrations.length} pending migration(s)`);
    
    for (const file of pendingMigrations) {
      logger.info(`Executing migration: ${file}`);
      const filePath = join(migrationsDir, file);
      const sql = await readFile(filePath, 'utf-8');
      await executeMigration(file, sql);
    }
    
    logger.info(`✓ Successfully executed ${pendingMigrations.length} migration(s)`);
    logger.info('=== Migrations completed ===');
  } catch (error) {
    logger.error('!!! Migration process failed !!!', { error });
    throw error;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed', { error });
      process.exit(1);
    });
}

export { runMigrations };
