/**
 * Migration runner.
 *
 * Legge i file `db/migrations/NNNN_*.sql` (root del repo), confronta con la
 * tabella `schema_migrations`, e applica in ordine quelle non ancora eseguite.
 * Ogni migrazione gira nella sua transazione: se fallisce, rollback.
 *
 * I file di migrazione possono già contenere il loro `BEGIN; ... COMMIT;`
 * (come fa la 0001). Il runner lo gestisce eseguendo tutto il file in un
 * unico statement: se il file ha BEGIN/COMMIT li rispetta, altrimenti
 * incapsuliamo noi.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Pool standalone (non quella applicativa) così il runner può girare anche
// per il DB demo via override del flag --target o env TARGET=demo.
const target = process.argv.includes('--target=demo') || process.env.TARGET === 'demo'
  ? 'demo' : 'main';
const url = target === 'demo'
  ? (process.env.DEMO_DATABASE_URL || '')
  : (process.env.DATABASE_URL || '');
if (!url) {
  console.error(`Manca ${target === 'demo' ? 'DEMO_DATABASE_URL' : 'DATABASE_URL'}`);
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 3 });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../db/migrations');

const MIGRATION_FILE_RE = /^(\d{4,})_[a-z0-9_-]+\.sql$/i;

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => MIGRATION_FILE_RE.test(name))
    .sort();
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  return new Set(result.rows.map((r) => r.version));
}

async function applyMigration(file: string): Promise<void> {
  const version = file.replace(/\.sql$/i, '');
  const fullPath = join(MIGRATIONS_DIR, file);
  const sql = await readFile(fullPath, 'utf8');

  const client = await pool.connect();
  try {
    // Eseguiamo il file così com'è. Se contiene BEGIN/COMMIT funziona; in caso
    // contrario lo wrappiamo per garantire atomicità.
    const hasOwnTx = /\bBEGIN\b/i.test(sql) && /\bCOMMIT\b/i.test(sql);
    if (!hasOwnTx) {
      await client.query('BEGIN');
    }
    await client.query(sql);
    if (!hasOwnTx) {
      await client.query('COMMIT');
    }
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ($1)
       ON CONFLICT (version) DO NOTHING`,
      [version],
    );
    console.log(`✓ applicata ${version}`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore: la connessione potrebbe essere già fuori transazione
    }
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log(`Migration runner — target: ${target} — directory: ${MIGRATIONS_DIR}`);
  await ensureMigrationsTable();

  const files = await listMigrationFiles();
  if (files.length === 0) {
    console.log('Nessun file di migrazione trovato.');
    return;
  }

  const applied = await appliedVersions();
  const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/i, '')));

  if (pending.length === 0) {
    console.log(`Nessuna migrazione da applicare. Già applicate: ${applied.size}.`);
    return;
  }

  console.log(`Migrazioni da applicare: ${pending.length}`);
  for (const file of pending) {
    await applyMigration(file);
  }
  console.log('Fatto.');
}

main()
  .catch((err) => {
    console.error('Migration runner fallito:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
