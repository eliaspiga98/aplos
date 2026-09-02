import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { withTx } from '../db/pool.js';
import { nextMaintenanceDate, type RecurrenceUnit } from '../maintenance-schedule.js';

const NullableStr = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});
const MachineBody = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 200 }),
  marca: NullableStr,
  modello: NullableStr,
  matricola: NullableStr,
  ubicazione: NullableStr,
  note: NullableStr,
});
const MaintenanceBody = Type.Object({
  titolo: Type.String({ minLength: 1, maxLength: 200 }),
  descrizione: NullableStr,
  prossima_scadenza: Type.String({ format: 'date' }),
  preavviso_giorni: Type.Integer({ minimum: 0, maximum: 365 }),
  ricorrenza_valore: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  ricorrenza_unita: Type.Optional(Type.Union([
    Type.Literal('giorni'), Type.Literal('mesi'), Type.Literal('anni'), Type.Null(),
  ])),
  attiva: Type.Optional(Type.Boolean()),
});
const MACHINE_KEYS = ['nome', 'marca', 'modello', 'matricola', 'ubicazione', 'note'] as const;
const MAINTENANCE_KEYS = [
  'titolo', 'descrizione', 'prossima_scadenza', 'preavviso_giorni',
  'ricorrenza_valore', 'ricorrenza_unita', 'attiva',
] as const;

export async function macchinariRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/alerts', async (req) => {
    const result = await req.pool.query(
      `SELECT mp.id, mp.id_macchinario, mp.titolo, mp.prossima_scadenza,
              mp.preavviso_giorni, m.nome AS macchinario_nome,
              (mp.prossima_scadenza - CURRENT_DATE)::int AS giorni,
              CASE WHEN mp.prossima_scadenza <= CURRENT_DATE THEN 'scadenza' ELSE 'preavviso' END AS tipo
       FROM manutenzioni_programmate mp
       JOIN macchinari m ON m.id = mp.id_macchinario AND m.deleted_at IS NULL
       WHERE mp.deleted_at IS NULL AND mp.attiva = TRUE
         AND mp.prossima_scadenza <= CURRENT_DATE + mp.preavviso_giorni
         AND NOT EXISTS (
           SELECT 1 FROM manutenzioni_notifiche_lette nl
           WHERE nl.id_operatore = $1 AND nl.id_manutenzione = mp.id
             AND nl.scadenza = mp.prossima_scadenza
             AND nl.tipo = CASE WHEN mp.prossima_scadenza <= CURRENT_DATE THEN 'scadenza' ELSE 'preavviso' END
         )
       ORDER BY mp.prossima_scadenza ASC, m.nome ASC`,
      [req.user!.id],
    );
    return result.rows;
  });

  app.post('/alerts/:id/ack', {
    schema: {
      params: IdParams,
      body: Type.Object({
        scadenza: Type.String({ format: 'date' }),
        tipo: Type.Union([Type.Literal('preavviso'), Type.Literal('scadenza')]),
      }),
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const { scadenza, tipo } = req.body as { scadenza: string; tipo: string };
    const result = await req.pool.query(
      `INSERT INTO manutenzioni_notifiche_lette (id_operatore, id_manutenzione, scadenza, tipo)
       SELECT $1, mp.id, $3, $4
       FROM manutenzioni_programmate mp
       JOIN macchinari m ON m.id = mp.id_macchinario
       WHERE mp.id = $2 AND mp.deleted_at IS NULL AND m.deleted_at IS NULL
       ON CONFLICT DO NOTHING
       RETURNING id_manutenzione`,
      [req.user!.id, id, scadenza, tipo],
    );
    if (result.rowCount === 0) {
      const exists = await req.pool.query(
        `SELECT 1 FROM manutenzioni_notifiche_lette
         WHERE id_operatore = $1 AND id_manutenzione = $2 AND scadenza = $3 AND tipo = $4`,
        [req.user!.id, id, scadenza, tipo],
      );
      if (exists.rowCount === 0) return reply.code(404).send({ error: 'Manutenzione non trovata' });
    }
    return { status: 'ok' };
  });

  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { q, limit = 50, offset = 0 } = req.query as { q?: string; limit?: number; offset?: number };
    const params: unknown[] = [];
    const where = ['m.deleted_at IS NULL'];
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      where.push(`(m.nome ILIKE $${params.length} OR m.marca ILIKE $${params.length} OR m.modello ILIKE $${params.length} OR m.matricola ILIKE $${params.length})`);
    }
    params.push(Math.min(Number(limit) || 50, 500), Math.max(Number(offset) || 0, 0));
    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(
      `SELECT m.*,
              COUNT(mp.id) FILTER (WHERE mp.deleted_at IS NULL AND mp.attiva)::int AS manutenzioni_attive,
              MIN(mp.prossima_scadenza) FILTER (WHERE mp.deleted_at IS NULL AND mp.attiva) AS prossima_manutenzione,
              COUNT(*) OVER () AS _total
       FROM macchinari m
       LEFT JOIN manutenzioni_programmate mp ON mp.id_macchinario = m.id
       WHERE ${where.join(' AND ')}
       GROUP BY m.id ORDER BY m.nome ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const machine = await req.pool.query(`SELECT * FROM macchinari WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!machine.rows[0]) return reply.code(404).send({ error: 'Macchinario non trovato' });
    const [schedules, history] = await Promise.all([
      req.pool.query(
        `SELECT *, (prossima_scadenza - CURRENT_DATE)::int AS giorni
         FROM manutenzioni_programmate
         WHERE id_macchinario = $1 AND deleted_at IS NULL
         ORDER BY attiva DESC, prossima_scadenza ASC`, [id],
      ),
      req.pool.query(
        `SELECT mi.*, mp.titolo, o.nome AS operatore_nome
         FROM manutenzioni_interventi mi
         JOIN manutenzioni_programmate mp ON mp.id = mi.id_manutenzione
         LEFT JOIN operatori o ON o.id = mi.id_operatore
         WHERE mp.id_macchinario = $1 ORDER BY mi.completata_at DESC LIMIT 200`, [id],
      ),
    ]);
    return { ...machine.rows[0], manutenzioni: schedules.rows, interventi: history.rows };
  });

  app.post('/', { schema: { body: MachineBody } }, async (req, reply) => {
    const b = req.body as Record<string, string | null> & { nome: string };
    if (b.nome.trim().length === 0) {
      return reply.code(400).send({ error: 'Il nome non può essere vuoto' });
    }
    const result = await req.pool.query(
      `INSERT INTO macchinari (nome, marca, modello, matricola, ubicazione, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.nome.trim(), b.marca, b.modello, b.matricola, b.ubicazione, b.note],
    );
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'CREATE_MACCHINARIO', entita: 'macchinari', idEntita: result.rows[0].id });
    return reply.code(201).send(result.rows[0]);
  });

  app.patch('/:id', { schema: { params: IdParams, body: Type.Partial(MachineBody) } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const body = req.body as Record<string, unknown>;
    const keys = MACHINE_KEYS.filter((key) => body[key] !== undefined);
    if (keys.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
    if (body.nome !== undefined && String(body.nome).trim().length === 0) {
      return reply.code(400).send({ error: 'Il nome non può essere vuoto' });
    }
    const values = keys.map((key) => key === 'nome' ? String(body[key]).trim() : body[key]); values.push(id);
    const result = await req.pool.query(
      `UPDATE macchinari SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(', ')}
       WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING *`, values,
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'Macchinario non trovato' });
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'UPDATE_MACCHINARIO', entita: 'macchinari', idEntita: id, dettagli: { campi: keys } });
    return result.rows[0];
  });

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(`UPDATE macchinari SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Macchinario non trovato' });
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'DELETE_MACCHINARIO', entita: 'macchinari', idEntita: id });
    return { status: 'ok' };
  });

  app.post('/:id/manutenzioni', { schema: { params: IdParams, body: MaintenanceBody } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const b = req.body as Record<string, unknown>;
    const machine = await req.pool.query(`SELECT 1 FROM macchinari WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (machine.rowCount === 0) return reply.code(404).send({ error: 'Macchinario non trovato' });
    if ((b.ricorrenza_valore == null) !== (b.ricorrenza_unita == null)) {
      return reply.code(400).send({ error: 'Completa valore e unità della ricorrenza' });
    }
    const title = String(b.titolo).trim();
    if (title.length === 0) return reply.code(400).send({ error: 'Il titolo non può essere vuoto' });
    const result = await req.pool.query(
      `INSERT INTO manutenzioni_programmate
         (id_macchinario, titolo, descrizione, prossima_scadenza, preavviso_giorni, ricorrenza_valore, ricorrenza_unita, attiva)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::boolean, TRUE)) RETURNING *`,
      [id, title, b.descrizione, b.prossima_scadenza, b.preavviso_giorni, b.ricorrenza_valore, b.ricorrenza_unita, b.attiva],
    );
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'CREATE_MANUTENZIONE', entita: 'manutenzioni_programmate', idEntita: result.rows[0].id, dettagli: { id_macchinario: id } });
    return reply.code(201).send(result.rows[0]);
  });

  app.patch('/manutenzioni/:id', { schema: { params: IdParams, body: Type.Partial(MaintenanceBody) } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const body = req.body as Record<string, unknown>;
    const keys = MAINTENANCE_KEYS.filter((key) => body[key] !== undefined);
    if (keys.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
    if (body.titolo !== undefined && String(body.titolo).trim().length === 0) {
      return reply.code(400).send({ error: 'Il titolo non può essere vuoto' });
    }
    const current = await req.pool.query<{ ricorrenza_valore: number | null; ricorrenza_unita: string | null }>(
      `SELECT ricorrenza_valore, ricorrenza_unita
       FROM manutenzioni_programmate WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!current.rows[0]) return reply.code(404).send({ error: 'Manutenzione non trovata' });
    const recurrenceValue = body.ricorrenza_valore !== undefined
      ? body.ricorrenza_valore
      : current.rows[0].ricorrenza_valore;
    const recurrenceUnit = body.ricorrenza_unita !== undefined
      ? body.ricorrenza_unita
      : current.rows[0].ricorrenza_unita;
    if ((recurrenceValue == null) !== (recurrenceUnit == null)) {
      return reply.code(400).send({ error: 'Completa valore e unità della ricorrenza' });
    }
    const values = keys.map((key) => key === 'titolo' ? String(body[key]).trim() : body[key]); values.push(id);
    const result = await req.pool.query(
      `UPDATE manutenzioni_programmate SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(', ')}
       WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING *`, values,
    );
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'UPDATE_MANUTENZIONE', entita: 'manutenzioni_programmate', idEntita: id, dettagli: { campi: keys } });
    return result.rows[0];
  });

  app.delete('/manutenzioni/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(`UPDATE manutenzioni_programmate SET deleted_at = NOW(), attiva = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Manutenzione non trovata' });
    await logAudit(req.pool, { idOperatore: req.user!.id, azione: 'DELETE_MANUTENZIONE', entita: 'manutenzioni_programmate', idEntita: id });
    return { status: 'ok' };
  });

  app.post('/manutenzioni/:id/completa', {
    schema: { params: IdParams, body: Type.Object({ note: Type.Optional(Type.Union([Type.String(), Type.Null()])) }) },
  }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const { note } = req.body as { note?: string | null };
    const completed = await withTx(req.pool, async (client) => {
      const current = await client.query<{
        id: number; prossima_scadenza: string; ricorrenza_valore: number | null;
        ricorrenza_unita: RecurrenceUnit | null; oggi: string;
      }>(`SELECT id, prossima_scadenza, ricorrenza_valore, ricorrenza_unita, CURRENT_DATE AS oggi
          FROM manutenzioni_programmate WHERE id = $1 AND deleted_at IS NULL AND attiva = TRUE FOR UPDATE`, [id]);
      const schedule = current.rows[0];
      if (!schedule) return null;
      await client.query(
        `INSERT INTO manutenzioni_interventi (id_manutenzione, scadenza_prevista, note, id_operatore)
         VALUES ($1,$2,$3,$4)`, [id, schedule.prossima_scadenza, note ?? null, req.user!.id],
      );
      const next = schedule.ricorrenza_valore && schedule.ricorrenza_unita
        ? nextMaintenanceDate(schedule.prossima_scadenza, schedule.ricorrenza_valore, schedule.ricorrenza_unita, schedule.oggi)
        : null;
      const result = await client.query(
        `UPDATE manutenzioni_programmate
         SET prossima_scadenza = COALESCE($1::date, prossima_scadenza), attiva = ($1::date IS NOT NULL)
         WHERE id = $2 RETURNING *`, [next, id],
      );
      await logAudit(client, { idOperatore: req.user!.id, azione: 'COMPLETA_MANUTENZIONE', entita: 'manutenzioni_programmate', idEntita: id, dettagli: { scadenza: schedule.prossima_scadenza, prossima_scadenza: next } });
      return result.rows[0];
    });
    if (!completed) return reply.code(404).send({ error: 'Manutenzione attiva non trovata' });
    return completed;
  });
}
