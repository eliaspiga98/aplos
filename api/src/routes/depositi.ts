import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';

const Body = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 100 }),
  descrizione: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
const PartialBody = Type.Partial(Body);
const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});
const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export async function depositiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { q, limit = 100, offset = 0 } = req.query as { q?: string; limit?: number; offset?: number };
    const where: string[] = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q && q.length > 0) {
      params.push(`%${q}%`);
      where.push(`(d.nome ILIKE $${params.length} OR d.descrizione ILIKE $${params.length})`);
    }
    params.push(limit, offset);

    // `n_materiali` conta le righe anagrafiche; `quantita_materiali` conta le
    // unita realmente disponibili, comprese quelle gia aperte/parziali.
    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(
      `SELECT d.id, d.nome, d.descrizione, d.created_at, d.updated_at,
              COALESCE((SELECT COUNT(*) FROM materiali m
                        WHERE m.id_deposito = d.id AND m.deleted_at IS NULL), 0)::int AS n_materiali,
              COALESCE((SELECT SUM(COALESCE(m.quantita, 0) + COALESCE(m.quantita_parziale, 0))
                        FROM materiali m
                        WHERE m.id_deposito = d.id AND m.deleted_at IS NULL), 0)::double precision
                AS quantita_materiali,
              COUNT(*) OVER () AS _total
       FROM depositi d
       WHERE ${where.join(' AND ')}
       ORDER BY d.nome ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `SELECT * FROM depositi WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'Deposito non trovato' });
    return row;
  });

  app.post('/', { schema: { body: Body } }, async (req, reply) => {
    const b = req.body as { nome: string; descrizione?: string | null };
    try {
      const result = await req.pool.query(
        `INSERT INTO depositi (nome, descrizione) VALUES ($1, $2) RETURNING *`,
        [b.nome.trim(), b.descrizione ?? null],
      );
      const created = result.rows[0];
      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'CREATE_DEPOSITO',
        entita: 'depositi',
        idEntita: created.id,
        dettagli: { nome: created.nome },
      });
      return reply.code(201).send(created);
    } catch (err) {
      // unique violation
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: `Esiste già un deposito chiamato "${b.nome.trim()}"` });
      }
      throw err;
    }
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: PartialBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const b = req.body as { nome?: string; descrizione?: string | null };
      const fields: string[] = [];
      const values: unknown[] = [];
      if (b.nome !== undefined) { fields.push(`nome = $${fields.length + 1}`); values.push(b.nome); }
      if (b.descrizione !== undefined) { fields.push(`descrizione = $${fields.length + 1}`); values.push(b.descrizione); }
      if (fields.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
      values.push(id);
      const result = await req.pool.query(
        `UPDATE depositi SET ${fields.join(', ')}
         WHERE id = $${values.length} AND deleted_at IS NULL
         RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      if (!updated) return reply.code(404).send({ error: 'Deposito non trovato' });
      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_DEPOSITO',
        entita: 'depositi',
        idEntita: updated.id,
        dettagli: { campi: Object.keys(b) },
      });
      return updated;
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    // Verifica che il deposito non abbia materiali attivi: in tal caso 409.
    const used = await req.pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM materiali WHERE id_deposito = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (Number(used.rows[0]?.n ?? 0) > 0) {
      return reply.code(409).send({
        error: 'Impossibile eliminare il deposito: contiene ancora materiali attivi.',
      });
    }
    const result = await req.pool.query(
      `UPDATE depositi SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Deposito non trovato' });
    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'DELETE_DEPOSITO',
      entita: 'depositi',
      idEntita: id,
    });
    return { status: 'ok' };
  });
}
