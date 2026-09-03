import type { PoolClient } from 'pg';

export type AssignmentPhase = 'cad' | 'rifinitura' | 'altro';
export type AssignmentStatus = 'attivo' | 'completato';

export interface AssignmentInput {
  id?: number;
  id_collaboratore: number;
  fase: AssignmentPhase;
  mansione: string;
  stato_incarico: AssignmentStatus;
}

interface CurrentAssignment extends AssignmentInput {
  id: number;
  stato_incarico: AssignmentStatus;
  assegnato_at: string;
  completato_at: string | null;
}

export class AssignmentValidationError extends Error {}

function assignmentKey(value: Pick<AssignmentInput, 'id_collaboratore' | 'fase' | 'mansione'>): string {
  return `${value.id_collaboratore}:${value.fase}:${value.mansione.trim().toLocaleLowerCase('it')}`;
}

async function insertEvent(
  client: PoolClient,
  assignment: {
    id: number;
    id_lavoro: number;
    id_collaboratore: number;
    fase: AssignmentPhase;
    mansione: string;
  },
  event: 'assegnato' | 'completato' | 'riattivato' | 'modificato' | 'rimosso',
  operatorId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO lavori_assegnazioni_eventi
       (id_assegnazione, id_lavoro, id_collaboratore, fase, mansione,
        evento, id_operatore)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      assignment.id, assignment.id_lavoro, assignment.id_collaboratore,
      assignment.fase, assignment.mansione, event, operatorId,
    ],
  );
}

export function workStatePhase(state: string): AssignmentPhase | null {
  if (state === 'in_corso_cad') return 'cad';
  if (state === 'in_corso_rifinitura') return 'rifinitura';
  return null;
}

/** Completa gli incarichi attivi della fase quando il lavoro la abbandona. */
export async function completeActivePhaseAssignments(
  client: PoolClient,
  jobId: number,
  phase: AssignmentPhase,
  operatorId: number,
): Promise<number> {
  const changed = await client.query<{
    id: number;
    id_lavoro: number;
    id_collaboratore: number;
    fase: AssignmentPhase;
    mansione: string;
  }>(
    `UPDATE lavori_assegnazioni
        SET stato_incarico = 'completato', completato_at = NOW(),
            id_operatore_stato = $3
      WHERE id_lavoro = $1 AND fase = $2
        AND stato_incarico = 'attivo'
      RETURNING id, id_lavoro, id_collaboratore, fase, mansione`,
    [jobId, phase, operatorId],
  );
  for (const assignment of changed.rows) {
    await insertEvent(client, assignment, 'completato', operatorId);
  }
  return changed.rowCount ?? 0;
}

/**
 * Sincronizza i partecipanti correnti senza cancellare lo storico. Gli incarichi
 * completati restano collegati al lavoro e possono essere riattivati.
 */
export async function syncJobAssignments(
  client: PoolClient,
  jobId: number,
  requested: AssignmentInput[],
  operatorId: number,
): Promise<{ rows: Record<string, unknown>[]; removed: number; events: number }> {
  const desired = requested.map((assignment) => ({
    ...assignment,
    mansione: assignment.mansione.trim(),
  }));
  if (desired.some((assignment) => assignment.mansione.length === 0)) {
    throw new AssignmentValidationError('La mansione non può essere vuota');
  }
  const keys = new Set(desired.map(assignmentKey));
  if (keys.size !== desired.length) {
    throw new AssignmentValidationError('La stessa assegnazione è presente più volte');
  }

  const currentResult = await client.query<CurrentAssignment>(
    `SELECT id, id_collaboratore, fase, mansione, stato_incarico,
            assegnato_at, completato_at
       FROM lavori_assegnazioni
      WHERE id_lavoro = $1 AND stato_incarico <> 'rimosso'
      FOR UPDATE`,
    [jobId],
  );
  // pg restituisce i BIGINT come stringhe: normalizziamo gli identificativi
  // prima di confrontarli con gli interi validati da TypeBox nel payload HTTP.
  const currentAssignments = currentResult.rows.map((assignment) => ({
    ...assignment,
    id: Number(assignment.id),
    id_collaboratore: Number(assignment.id_collaboratore),
  }));
  const currentById = new Map(currentAssignments.map((assignment) => [assignment.id, assignment]));
  const requestedIds = new Set(desired.flatMap((assignment) => assignment.id ? [assignment.id] : []));
  if (requestedIds.size !== desired.filter((assignment) => assignment.id).length) {
    throw new AssignmentValidationError('La stessa assegnazione è presente più volte');
  }
  for (const id of requestedIds) {
    if (!currentById.has(id)) {
      throw new AssignmentValidationError('Una delle assegnazioni non appartiene a questo lavoro');
    }
  }

  let removed = 0;
  let events = 0;
  for (const current of currentAssignments) {
    if (requestedIds.has(current.id)) continue;
    const result = await client.query<{
      id: number; id_lavoro: number; id_collaboratore: number;
      fase: AssignmentPhase; mansione: string;
    }>(
      `UPDATE lavori_assegnazioni
          SET stato_incarico = 'rimosso', rimosso_at = NOW(),
              id_operatore_rimozione = $2, id_operatore_stato = $2
        WHERE id = $1
        RETURNING id, id_lavoro, id_collaboratore, fase, mansione`,
      [current.id, operatorId],
    );
    await insertEvent(client, result.rows[0]!, 'rimosso', operatorId);
    removed += 1;
    events += 1;
  }

  for (const assignment of desired) {
    if (!assignment.id) {
      const inserted = await client.query<{
        id: number; id_lavoro: number; id_collaboratore: number;
        fase: AssignmentPhase; mansione: string;
      }>(
        `INSERT INTO lavori_assegnazioni
           (id_lavoro, id_collaboratore, fase, mansione,
            stato_incarico, completato_at,
            id_operatore_assegnazione, id_operatore_stato)
         VALUES ($1,$2,$3,$4,$5,
                 CASE WHEN $5 = 'completato' THEN NOW() ELSE NULL END,
                 $6,$6)
         RETURNING id, id_lavoro, id_collaboratore, fase, mansione`,
        [
          jobId, assignment.id_collaboratore, assignment.fase,
          assignment.mansione, assignment.stato_incarico, operatorId,
        ],
      );
      await insertEvent(client, inserted.rows[0]!, 'assegnato', operatorId);
      events += 1;
      if (assignment.stato_incarico === 'completato') {
        await insertEvent(client, inserted.rows[0]!, 'completato', operatorId);
        events += 1;
      }
      continue;
    }

    const current = currentById.get(assignment.id)!;
    if (current.id_collaboratore !== assignment.id_collaboratore) {
      throw new AssignmentValidationError(
        'Per cambiare collaboratore rimuovi l’incarico e aggiungine uno nuovo',
      );
    }
    const modified = current.fase !== assignment.fase || current.mansione !== assignment.mansione;
    const completed = current.stato_incarico === 'attivo' && assignment.stato_incarico === 'completato';
    const reactivated = current.stato_incarico === 'completato' && assignment.stato_incarico === 'attivo';
    const updated = await client.query<{
      id: number; id_lavoro: number; id_collaboratore: number;
      fase: AssignmentPhase; mansione: string;
    }>(
      `UPDATE lavori_assegnazioni
          SET fase = $2, mansione = $3, stato_incarico = $4,
              completato_at = CASE
                WHEN $4 = 'completato' AND stato_incarico <> 'completato' THEN NOW()
                WHEN $4 = 'attivo' THEN NULL
                ELSE completato_at
              END,
              id_operatore_stato = CASE
                WHEN stato_incarico <> $4 OR fase <> $2 OR mansione <> $3 THEN $5
                ELSE id_operatore_stato
              END
        WHERE id = $1
        RETURNING id, id_lavoro, id_collaboratore, fase, mansione`,
      [assignment.id, assignment.fase, assignment.mansione, assignment.stato_incarico, operatorId],
    );
    const row = updated.rows[0]!;
    if (completed) {
      await insertEvent(client, row, 'completato', operatorId);
      events += 1;
    } else if (reactivated) {
      await insertEvent(client, row, 'riattivato', operatorId);
      events += 1;
    } else if (modified) {
      await insertEvent(client, row, 'modificato', operatorId);
      events += 1;
    }
  }

  const fresh = await client.query(
    `SELECT a.id::int AS id, a.id_collaboratore::int AS id_collaboratore,
            c.nome AS collaboratore_nome,
            a.fase, a.mansione, a.stato_incarico, a.assegnato_at,
            a.completato_at
       FROM lavori_assegnazioni a
       JOIN collaboratori c ON c.id = a.id_collaboratore
      WHERE a.id_lavoro = $1 AND a.stato_incarico <> 'rimosso'
      ORDER BY (a.stato_incarico = 'attivo') DESC, a.assegnato_at`,
    [jobId],
  );
  return { rows: fresh.rows, removed, events };
}
