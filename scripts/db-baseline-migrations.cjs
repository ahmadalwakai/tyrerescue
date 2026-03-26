const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ws = require('ws');
const { neonConfig, Pool } = require('@neondatabase/serverless');

neonConfig.webSocketConstructor = ws;

function readJournal(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  const journalRaw = fs.readFileSync(journalPath, 'utf8');
  const journal = JSON.parse(journalRaw);

  if (!journal || !Array.isArray(journal.entries)) {
    throw new Error('Invalid drizzle migrations journal format');
  }

  return journal.entries;
}

function migrationHash(sqlContent) {
  return crypto.createHash('sha256').update(sqlContent).digest('hex');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const migrationsFolder = path.resolve(process.cwd(), 'drizzle', 'migrations');
  const entries = readJournal(migrationsFolder);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    let inserted = 0;

    for (const entry of entries) {
      const migrationPath = path.join(migrationsFolder, `${entry.tag}.sql`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const hash = migrationHash(sql);
      const createdAt = Number(entry.when);

      const exists = await client.query(
        'SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = $1 LIMIT 1',
        [createdAt],
      );

      if (exists.rowCount === 0) {
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [hash, createdAt],
        );
        inserted += 1;
      }
    }

    await client.query('COMMIT');

    console.log(`Baseline complete. Inserted ${inserted} migration marker(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to baseline migrations:', error);
  process.exit(1);
});
