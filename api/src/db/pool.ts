import pg from 'pg';
import { config } from '../config.js';
import { configurePostgresDateParser } from './date-types.js';

// PostgreSQL DATE rappresenta un giorno civile, non un istante. Il parser
// predefinito di `pg` crea invece un Date a mezzanotte locale che, durante la
// serializzazione JSON, può diventare il giorno precedente in UTC.
configurePostgresDateParser();

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Errore inatteso sulla pool Postgres principale', err);
});

/**
 * Pool al database "demo": stesso schema, dati separati. Usata SOLO dagli
 * operatori marcati `usa_demo = true` (toggle gestibile dall'admin).
 *
 * Lazy: viene creata solo se la URL è presente in env. Se DEMO_DATABASE_URL
 * non è settato, il flag usa_demo viene comunque accettato sui record degli
 * operatori ma rimane senza effetto (fallback alla pool principale).
 */
export const demoPool: pg.Pool | null = config.demoDatabaseUrl
  ? new pg.Pool({ connectionString: config.demoDatabaseUrl, max: 5 })
  : null;

if (demoPool) {
  demoPool.on('error', (err) => {
    console.error('Errore inatteso sulla pool Postgres demo', err);
  });
}

export type QueryResult<T> = { rows: T[]; rowCount: number | null };

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const result = await pool.query(text, params as never);
  return { rows: result.rows as T[], rowCount: result.rowCount };
}

export async function withTx<T>(
  poolToUse: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await poolToUse.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
