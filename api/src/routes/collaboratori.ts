import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { rowsToCsv, csvFilename } from '../csv.js';
import { withTx } from '../db/pool.js';

const NullableStr = Type.Optional(Type.Union([Type.String(), Type.Null()]));

const Body = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 200 }),
  telefono: NullableStr,
  email: NullableStr,
  mansioni: NullableStr,
  note: NullableStr,
});

const PartialBody = Type.Partial(Body);
const BODY_KEYS = ['nome', 'telefono', 'email', 'mansioni', 'note'] as const;
const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});
const StatsQuery = Type.Object({
  mese: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
});

export async function collaboratoriRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { q, limit = 50, offset = 0 } = req.query as { q?: string; limit?: number; offset?: number };
    const params: unknown[] = [];
    const where = ['c.deleted_at IS NULL'];
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      where.push(`(c.nome ILIKE $${params.length} OR c.mansioni ILIKE $${params.length})`);
    }
    params.push(limit, offset);
    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(
      `SELECT c.*,
              COUNT(DISTINCT a.id_lavoro) FILTER (
                WHERE a.stato_incarico = 'attivo' AND l.deleted_at IS NULL
                  AND l.archiviato_at IS NULL
              )::int AS lavori_attivi,
              COUNT(*) OVER () AS _total
       FROM collaboratori c
       LEFT JOIN lavori_assegnazioni a ON a.id_collaboratore = c.id
       LEFT JOIN lavori l ON l.id = a.id_lavoro
       WHERE ${where.join(' AND ')}
       GROUP BY c.id
       ORDER BY c.nome ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  app.get('/csv', async (req, reply) => {
    const result = await req.pool.query<Record<string, unknown>>(
      `SELECT id, nome, telefono, email, mansioni, note
       FROM collaboratori WHERE deleted_at IS NULL ORDER BY nome ASC LIMIT 10000`,
    );
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${csvFilename('collaboratori')}"`)
      .send(rowsToCsv(
        result.rows,
        ['id', 'nome', 'telefono', 'email', 'mansioni', 'note'],
        ['ID', 'Nome', 'Telefono', 'Email', 'Mansioni', 'Note'],
      ));
  });

  app.get('/statistiche', { schema: { querystring: StatsQuery } }, async (req) => {
    const { mese } = req.query as { mese: string };
    const [rows, pairs] = await Promise.all([
      req.pool.query(
        `WITH completamenti AS (
           SELECT DISTINCT e.id_collaboratore, e.id_lavoro, e.fase
             FROM lavori_assegnazioni_eventi e
             JOIN lavori l ON l.id = e.id_lavoro
            WHERE e.evento = 'completato'
              AND e.created_at >= ($1 || '-01')::date
              AND e.created_at < (($1 || '-01')::date + INTERVAL '1 month')
              AND l.deleted_at IS NULL
         )
         SELECT c.id, c.nome,
                COUNT(DISTINCT co.id_lavoro) FILTER (WHERE co.fase = 'cad')::int AS lavori_cad,
                COUNT(DISTINCT co.id_lavoro) FILTER (WHERE co.fase = 'rifinitura')::int AS lavori_rifinitura,
                COUNT(DISTINCT co.id_lavoro) FILTER (WHERE co.fase = 'altro')::int AS lavori_altro,
                COUNT(DISTINCT co.id_lavoro)::int AS lavori_totali
           FROM collaboratori c
           LEFT JOIN completamenti co ON co.id_collaboratore = c.id
          WHERE c.deleted_at IS NULL
          GROUP BY c.id, c.nome
          ORDER BY lavori_totali DESC, c.nome`,
        [mese],
      ),
      req.pool.query(
        `WITH completamenti AS (
           SELECT DISTINCT e.id_collaboratore, e.id_lavoro
             FROM lavori_assegnazioni_eventi e
             JOIN lavori l ON l.id = e.id_lavoro
            WHERE e.evento = 'completato'
              AND e.created_at >= ($1 || '-01')::date
              AND e.created_at < (($1 || '-01')::date + INTERVAL '1 month')
              AND l.deleted_at IS NULL
         )
         SELECT a.id_collaboratore AS id_primo, ca.nome AS primo,
                b.id_collaboratore AS id_secondo, cb.nome AS secondo,
                COUNT(DISTINCT a.id_lavoro)::int AS lavori_insieme
           FROM completamenti a
           JOIN completamenti b ON b.id_lavoro = a.id_lavoro
             AND b.id_collaboratore > a.id_collaboratore
           JOIN collaboratori ca ON ca.id = a.id_collaboratore
           JOIN collaboratori cb ON cb.id = b.id_collaboratore
          GROUP BY a.id_collaboratore, ca.nome, b.id_collaboratore, cb.nome
          ORDER BY lavori_insieme DESC, ca.nome, cb.nome`,
        [mese],
      ),
    ]);
    return { mese, collaboratori: rows.rows, coppie: pairs.rows };
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `SELECT * FROM collaboratori WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'Collaboratore non trovato' });
    return result.rows[0];
  });

  app.post('/', { schema: { body: Body } }, async (req, reply) => {
    const b = req.body as {
      nome: string;
      telefono?: string | null;
      email?: string | null;
      mansioni?: string | null;
      note?: string | null;
    };
    if (b.nome.trim().length === 0) {
      return reply.code(400).send({ error: 'Il nome non può essere vuoto' });
    }
    const result = await req.pool.query(
      `INSERT INTO collaboratori (nome, telefono, email, mansioni, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.nome.trim(), b.telefono, b.email, b.mansioni, b.note],
    );
    const created = result.rows[0];
    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'CREATE_COLLABORATORE',
      entita: 'collaboratori',
      idEntita: created.id,
    });
    return reply.code(201).send(created);
  });

  app.patch('/:id', { schema: { params: IdParams, body: PartialBody } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const body = req.body as Record<string, unknown>;
    const keys = BODY_KEYS.filter((key) => body[key] !== undefined);
    if (keys.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
    if (body.nome !== undefined && String(body.nome).trim().length === 0) {
      return reply.code(400).send({ error: 'Il nome non può essere vuoto' });
    }
    const setSql = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = keys.map((key) => key === 'nome' ? String(body[key]).trim() : body[key]);
    values.push(id);
    const result = await req.pool.query(
      `UPDATE collaboratori SET ${setSql}
       WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    const updated = result.rows[0];
    if (!updated) return reply.code(404).send({ error: 'Collaboratore non trovato' });
    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'UPDATE_COLLABORATORE',
      entita: 'collaboratori',
      idEntita: id,
      dettagli: { campi: keys },
    });
    return updated;
  });

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const archived = await withTx(req.pool, async (client) => {
      const result = await client.query(
        `UPDATE collaboratori SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) return null;
      const assignments = await client.query(
        `WITH rimossi AS (
           UPDATE lavori_assegnazioni
              SET stato_incarico = 'rimosso', rimosso_at = NOW(),
                  id_operatore_rimozione = $1, id_operatore_stato = $1
            WHERE id_collaboratore = $2 AND stato_incarico <> 'rimosso'
            RETURNING id, id_lavoro, id_collaboratore, fase, mansione, rimosso_at
         )
         INSERT INTO lavori_assegnazioni_eventi
           (id_assegnazione, id_lavoro, id_collaboratore, fase, mansione,
            evento, id_operatore, created_at)
         SELECT id, id_lavoro, id_collaboratore, fase, mansione,
                'rimosso', $1, rimosso_at
           FROM rimossi
         RETURNING id`,
        [req.user!.id, id],
      );
      await logAudit(client, {
        idOperatore: req.user!.id,
        azione: 'DELETE_COLLABORATORE',
        entita: 'collaboratori',
        idEntita: id,
        dettagli: { assegnazioni_chiuse: assignments.rowCount ?? 0 },
      });
      return true;
    });
    if (!archived) return reply.code(404).send({ error: 'Collaboratore non trovato' });
    return { status: 'ok' };
  });
}
