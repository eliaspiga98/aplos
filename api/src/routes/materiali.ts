import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { rowsToCsv, csvFilename } from '../csv.js';

const Categoria = Type.Union([
  Type.Literal('zirconio'),
  Type.Literal('pmma'),
  Type.Literal('resina'),
  Type.Literal('metallo'),
  Type.Literal('ceramica'),
  Type.Literal('altro'),
]);

const StatoUtilizzo = Type.Union([
  Type.Literal('nuovo'),
  Type.Literal('parziale'),
  Type.Literal('esaurito'),
]);

const NullableStr = Type.Optional(Type.Union([Type.String(), Type.Null()]));
const NullableNum = Type.Optional(Type.Union([Type.Number(), Type.Null()]));

const CreateBody = Type.Object({
  categoria: Categoria,
  sottotipo: NullableStr,
  marca: NullableStr,
  colore: NullableStr,
  lotto: Type.String({ minLength: 1, maxLength: 100 }),
  id_deposito: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  altezza_mm: NullableNum,
  larghezza_mm: NullableNum,
  quantita: NullableNum,
  unita_misura: NullableStr,
  stato_utilizzo: Type.Optional(StatoUtilizzo),
  soglia_alert: NullableNum,
  attributi_extra: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

const UpdateBody = Type.Partial(CreateBody);

const ListQuery = Type.Object({
  categoria: Type.Optional(Categoria),
  stato_utilizzo: Type.Optional(StatoUtilizzo),
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

const FIELDS = [
  'categoria', 'sottotipo', 'marca', 'colore', 'lotto', 'id_deposito',
  'altezza_mm', 'larghezza_mm', 'quantita', 'unita_misura',
  'stato_utilizzo', 'soglia_alert', 'attributi_extra',
] as const;

export async function materialiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { categoria, stato_utilizzo, q, limit = 50, offset = 0 } = req.query as {
      categoria?: string;
      stato_utilizzo?: string;
      q?: string;
      limit?: number;
      offset?: number;
    };

    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (categoria) {
      params.push(categoria);
      where.push(`categoria = $${params.length}`);
    }
    if (stato_utilizzo) {
      params.push(stato_utilizzo);
      where.push(`stato_utilizzo = $${params.length}`);
    }
    if (q && q.trim().length > 0) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(`(lotto ILIKE $${idx} OR marca ILIKE $${idx} OR colore ILIKE $${idx})`);
    }
    params.push(limit, offset);

    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(
      `SELECT m.*, d.nome AS deposito_nome, COUNT(*) OVER () AS _total
       FROM materiali m
       LEFT JOIN depositi d ON d.id = m.id_deposito AND d.deleted_at IS NULL
       WHERE ${where.join(' AND ').replace(/\b(deleted_at|categoria|stato_utilizzo|lotto|marca|colore)\b/g, 'm.$1')}
       ORDER BY m.categoria ASC, m.marca ASC, m.lotto ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  app.get('/csv', async (req, reply) => {
    const { categoria, stato_utilizzo, q } = req.query as {
      categoria?: string;
      stato_utilizzo?: string;
      q?: string;
    };
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (categoria) { params.push(categoria); where.push(`categoria = $${params.length}`); }
    if (stato_utilizzo) { params.push(stato_utilizzo); where.push(`stato_utilizzo = $${params.length}`); }
    if (q && q.trim().length > 0) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(`(lotto ILIKE $${idx} OR marca ILIKE $${idx} OR colore ILIKE $${idx})`);
    }
    const result = await req.pool.query<Record<string, unknown>>(
      `SELECT m.id, m.categoria, m.sottotipo, m.marca, m.colore, m.lotto,
              d.nome AS deposito,
              m.altezza_mm, m.larghezza_mm, m.quantita, m.unita_misura,
              m.stato_utilizzo, m.soglia_alert
       FROM materiali m
       LEFT JOIN depositi d ON d.id = m.id_deposito AND d.deleted_at IS NULL
       WHERE ${where.join(' AND ').replace(/\b(deleted_at|categoria|stato_utilizzo|lotto|marca|colore)\b/g, 'm.$1')}
       ORDER BY m.categoria, m.marca, m.lotto LIMIT 10000`,
      params,
    );
    const cols = ['id', 'categoria', 'sottotipo', 'marca', 'colore', 'lotto', 'deposito',
                  'altezza_mm', 'larghezza_mm', 'quantita', 'unita_misura', 'stato_utilizzo', 'soglia_alert'];
    const headers = ['ID', 'Categoria', 'Sottotipo', 'Marca', 'Colore', 'Lotto', 'Deposito',
                     'Altezza (mm)', 'Larghezza (mm)', 'Quantità', 'Unità', 'Stato', 'Soglia'];
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${csvFilename('materiali')}"`)
      .send(rowsToCsv(result.rows, cols, headers));
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `SELECT m.*, d.nome AS deposito_nome
       FROM materiali m
       LEFT JOIN depositi d ON d.id = m.id_deposito AND d.deleted_at IS NULL
       WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'Materiale non trovato' });
    return row;
  });

  app.post('/', { schema: { body: CreateBody } }, async (req, reply) => {
    const b = req.body as Record<string, unknown>;

    const cols = FIELDS.filter((f) => b[f] !== undefined);
    const values = cols.map((f) => (f === 'attributi_extra' ? JSON.stringify(b[f] ?? {}) : b[f] ?? null));
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    const result = await req.pool.query(
      `INSERT INTO materiali (${cols.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values,
    );
    const created = result.rows[0];

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'CREATE_MATERIALE',
      entita: 'materiali',
      idEntita: created.id,
      dettagli: { categoria: created.categoria, lotto: created.lotto },
    });

    return reply.code(201).send(created);
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: UpdateBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const b = req.body as Record<string, unknown>;

      const cols = FIELDS.filter((f) => b[f] !== undefined);
      if (cols.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });

      const values = cols.map((f) => (f === 'attributi_extra' ? JSON.stringify(b[f]) : b[f]));
      const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      values.push(id);

      const result = await req.pool.query(
        `UPDATE materiali SET ${setSql}
         WHERE id = $${cols.length + 1} AND deleted_at IS NULL
         RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      if (!updated) return reply.code(404).send({ error: 'Materiale non trovato' });

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_MATERIALE',
        entita: 'materiali',
        idEntita: updated.id,
        dettagli: { campi: cols },
      });

      return updated;
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `UPDATE materiali SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Materiale non trovato' });

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'DELETE_MATERIALE',
      entita: 'materiali',
      idEntita: id,
    });
    return { status: 'ok' };
  });
}
