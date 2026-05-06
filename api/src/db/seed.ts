/**
 * Seed di sviluppo. Crea un operatore admin di default se non esiste.
 *
 *   nome: "Admin"
 *   pin:  "0000"   (DA CAMBIARE al primo login)
 *
 * Eseguire dopo le migrazioni:
 *   npm run seed
 */

import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const DEFAULT_NAME = 'Admin';
const DEFAULT_PIN = '0000';

async function main(): Promise<void> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM operatori WHERE nome = $1 AND deleted_at IS NULL`,
    [DEFAULT_NAME],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    console.log(`Operatore "${DEFAULT_NAME}" già presente, niente da fare.`);
    return;
  }

  const pinHash = await bcrypt.hash(DEFAULT_PIN, 10);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO operatori (nome, ruolo, pin_hash)
     VALUES ($1, 'admin', $2)
     RETURNING id`,
    [DEFAULT_NAME, pinHash],
  );

  console.log(`Creato operatore admin "${DEFAULT_NAME}" id=${result.rows[0]?.id}`);
  console.log(`PIN di default: ${DEFAULT_PIN} — cambialo subito.`);
}

main()
  .catch((err) => {
    console.error('Seed fallito:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
