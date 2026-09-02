import pg from 'pg';
import { config } from '../config.js';
import { configurePostgresDateParser } from './date-types.js';

configurePostgresDateParser();

/**
 * Pool dedicato al modulo AI (text-to-SQL). Dovrebbe puntare a un utente DB
 * con SOLI privilegi SELECT. Se `READONLY_DATABASE_URL` non è configurato
 * facciamo fallback all'utente principale, MA blindiamo ogni query con
 * `BEGIN READ ONLY` + `SET LOCAL statement_timeout` per ridurre il rischio.
 *
 * In produzione configurare l'utente read-only in Postgres con:
 *   CREATE USER aplos_readonly WITH PASSWORD '...';
 *   GRANT CONNECT ON DATABASE aplos TO aplos_readonly;
 *   GRANT USAGE ON SCHEMA public TO aplos_readonly;
 *   GRANT SELECT ON ALL TABLES IN SCHEMA public TO aplos_readonly;
 *   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO aplos_readonly;
 */
const url = config.readonlyDatabaseUrl || config.databaseUrl;

export const readonlyPool = new pg.Pool({
  connectionString: url,
  max: 3,
});

readonlyPool.on('error', (err) => {
  console.error('Errore inatteso sulla pool read-only', err);
});
