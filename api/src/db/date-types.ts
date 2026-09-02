import pg from 'pg';

const POSTGRES_DATE_OID = 1082;

/** Mantiene i campi SQL DATE come YYYY-MM-DD, senza conversione timezone. */
export function configurePostgresDateParser(): void {
  pg.types.setTypeParser(POSTGRES_DATE_OID, (value: string) => value);
}
