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
    await client.query(sql);
    await client.query(
      'INSERT INTO migrations (name) VALUES ($1)',
      [name]
    );
    logger.info(`Migration executed: ${name}`);
  });
}

async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting migrations...');
    
    await createMigrationsTable();
    
    const executedMigrations = await getExecutedMigrations();
    const executedNames = new Set(executedMigrations.map(m => m.name));
    
    const migrationsDir = join(__dirname, 'migrations');
    const files = await readdir(migrationsDir);
    
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    let executed = 0;
    
    for (const file of migrationFiles) {
      if (!executedNames.has(file)) {
        const filePath = join(migrationsDir, file);
        const sql = await readFile(filePath, 'utf-8');
        await executeMigration(file, sql);
        executed++;
      }
    }
    
    if (executed === 0) {
      logger.info('No new migrations to execute');
    } else {
      logger.info(`Successfully executed ${executed} migration(s)`);
    }
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed', { error });
      process.exit(1);
    });
}

export { runMigrations };
