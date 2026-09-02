import type { PoolClient } from 'pg';

import {
  planMaterialUsage,
  type StatoPrelievoMateriale,
} from './material-inventory.js';

export interface MaterialUsageInput {
  id_materiale: number;
  stato_prelievo?: StatoPrelievoMateriale;
  quantita_usata?: number;
  note?: string;
}

export class MaterialUsageError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MaterialUsageError';
    this.statusCode = statusCode;
  }
}

interface MaterialRow {
  id: number;
  quantita: string;
  quantita_parziale: string;
  unita_misura: string | null;
}

export async function registerMaterialUsage(
  client: PoolClient,
  input: MaterialUsageInput & { id_lavoro: number; id_operatore: number },
): Promise<Record<string, unknown>> {
  const result = await client.query<MaterialRow>(
    `SELECT id, quantita, quantita_parziale, unita_misura
     FROM materiali
     WHERE id = $1 AND deleted_at IS NULL
     FOR UPDATE`,
    [input.id_materiale],
  );
  const material = result.rows[0];
  if (!material) {
    throw new MaterialUsageError('Materiale non trovato o archiviato', 404);
  }

  const quantitaNuova = Number(material.quantita);
  const quantitaParziale = Number(material.quantita_parziale);
  const statoPrelievo = input.stato_prelievo
    ?? (quantitaNuova > 0 ? 'nuovo' : 'parziale');
  const quantitaUsata = input.quantita_usata ?? 1;

  let plan;
  try {
    plan = planMaterialUsage(
      { quantitaNuova, quantitaParziale },
      statoPrelievo,
      quantitaUsata,
    );
  } catch (error) {
    throw new MaterialUsageError(
      error instanceof Error ? error.message : 'Disponibilità materiale insufficiente',
      409,
    );
  }

  await client.query(
    `UPDATE materiali
     SET quantita = $1, quantita_parziale = $2, stato_utilizzo = $3
     WHERE id = $4`,
    [plan.quantitaNuova, plan.quantitaParziale, plan.stato, material.id],
  );

  const inserted = await client.query<Record<string, unknown>>(
    `INSERT INTO lavori_materiali
       (id_lavoro, id_materiale, quantita_usata, unita_misura, note,
        id_operatore, stato_prelievo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.id_lavoro,
      material.id,
      quantitaUsata,
      material.unita_misura,
      input.note?.trim() || null,
      input.id_operatore,
      statoPrelievo,
    ],
  );

  return inserted.rows[0]!;
}
