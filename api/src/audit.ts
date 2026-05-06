import type pg from 'pg';

interface AuditEntry {
  idOperatore: number | null;
  azione: string;
  entita?: string;
  idEntita?: number | null;
  dettagli?: Record<string, unknown>;
}

/**
 * Registra un'azione nell'audit log. Da chiamare per ogni operazione che
 * modifica dati significativi (cambio stato lavoro, registrazione consumo
 * materiale, soft delete, ecc.).
 *
 * Il primo argomento è la pool/client su cui scrivere — di solito è
 * `req.pool`, ma può essere un client dentro una transazione esistente.
 */
export async function logAudit(
  runner: pg.Pool | pg.PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await runner.query(
    `INSERT INTO audit_log (id_operatore, azione, entita, id_entita, dettagli)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.idOperatore,
      entry.azione,
      entry.entita ?? null,
      entry.idEntita ?? null,
      JSON.stringify(entry.dettagli ?? {}),
    ],
  );
}
