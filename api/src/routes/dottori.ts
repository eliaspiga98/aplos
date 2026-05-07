import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { rowsToCsv, csvFilename } from '../csv.js';

const NullableStr = Type.Optional(Type.Union([Type.String(), Type.Null()]));

const Body = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 200 }),
  studio: NullableStr,
  telefono: NullableStr,
  email: NullableStr,
  indirizzo: NullableStr,
  partita_iva: NullableStr,
  codice_fiscale: NullableStr,
  note: NullableStr,
});

const PartialBody = Type.Partial(Body);

const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export async function dottoriRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { q, limit = 50, offset = 0 } = req.query as {
      q?: string;
      limit?: number;
      offset?: number;
    };
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q && q.length > 0) {
      params.push(`%${q}%`);
      where.push(`(nome ILIKE $${params.length} OR studio ILIKE $${params.length})`);
    }
    params.push(limit, offset);
    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(
      `SELECT *, COUNT(*) OVER () AS _total FROM dottori
       WHERE ${where.join(' AND ')}
       ORDER BY nome ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  app.get('/csv', async (req, reply) => {
    const { q } = req.query as { q?: string };
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q && q.length > 0) {
      params.push(`%${q}%`);
      where.push(`(nome ILIKE $${params.length} OR studio ILIKE $${params.length})`);
    }
    const result = await req.pool.query<Record<string, unknown>>(
      `SELECT id, nome, studio, telefono, email, indirizzo, partita_iva, codice_fiscale
       FROM dottori WHERE ${where.join(' AND ')}
       ORDER BY nome ASC LIMIT 10000`,
      params,
    );
    const cols = ['id', 'nome', 'studio', 'telefono', 'email', 'indirizzo', 'partita_iva', 'codice_fiscale'];
    const headers = ['ID', 'Nome', 'Studio', 'Telefono', 'Email', 'Indirizzo', 'P.IVA', 'C.F.'];
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${csvFilename('dottori')}"`)
      .send(rowsToCsv(result.rows, cols, headers));
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `SELECT * FROM dottori WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ error: 'Dottore non trovato' });
    return row;
  });

  /**
   * Statistiche aggregate per dottore + ultimi lavori.
   * Restituisce conteggi per stato, ritardi, tempi medi consegna,
   * e la lista degli ultimi N lavori (per visualizzazione storico).
   */
  app.get('/:id/stats', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };

    const dottoreResult = await req.pool.query(
      `SELECT * FROM dottori WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (dottoreResult.rowCount === 0) {
      return reply.code(404).send({ error: 'Dottore non trovato' });
    }

    const [byStato, riassunto, ultimi] = await Promise.all([
      req.pool.query(
        `SELECT stato, COUNT(*)::int AS n
         FROM lavori
         WHERE id_dottore = $1 AND deleted_at IS NULL
         GROUP BY stato`,
        [id],
      ),
      req.pool.query<{
        totale: number; in_ritardo: number;
        tempo_medio_giorni: number | null; tempo_medio_finiti_giorni: number | null;
      }>(
        `SELECT
           COUNT(*)::int AS totale,
           COUNT(*) FILTER (
             WHERE stato <> 'finito' AND data_consegna < CURRENT_DATE
           )::int AS in_ritardo,
           ROUND(AVG(data_consegna - data_entrata))::int AS tempo_medio_giorni,
           ROUND(AVG(data_consegna - data_entrata) FILTER (WHERE stato = 'finito'))::int
             AS tempo_medio_finiti_giorni
         FROM lavori
         WHERE id_dottore = $1 AND deleted_at IS NULL`,
        [id],
      ),
      req.pool.query(
        `SELECT id, nome_paziente, data_entrata, data_consegna, stato, scala_colori,
                tipologia_lavoro
         FROM lavori
         WHERE id_dottore = $1 AND deleted_at IS NULL
         ORDER BY data_consegna DESC
         LIMIT 50`,
        [id],
      ),
    ]);

    const counts: Record<string, number> = {
      in_attesa: 0, in_corso: 0, in_prova: 0, finito: 0,
    };
    for (const r of byStato.rows) counts[r.stato as string] = Number(r.n);

    return {
      dottore: dottoreResult.rows[0],
      counts,
      riassunto: riassunto.rows[0],
      ultimi: ultimi.rows,
    };
  });

  app.post('/', { schema: { body: Body } }, async (req, reply) => {
    const b = req.body as Record<string, string | null>;
    const result = await req.pool.query(
      `INSERT INTO dottori
         (nome, studio, telefono, email, indirizzo, partita_iva, codice_fiscale, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [b.nome, b.studio, b.telefono, b.email, b.indirizzo, b.partita_iva, b.codice_fiscale, b.note],
    );
    const created = result.rows[0];
    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'CREATE_DOTTORE',
      entita: 'dottori',
      idEntita: created.id,
    });
    return reply.code(201).send(created);
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: PartialBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const body = req.body as Record<string, string | null | undefined>;
      const keys = Object.keys(body).filter((k) => body[k] !== undefined);
      if (keys.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });

      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values: unknown[] = keys.map((k) => body[k]);
      values.push(id);

      const result = await req.pool.query(
        `UPDATE dottori SET ${setSql}
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL
         RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      if (!updated) return reply.code(404).send({ error: 'Dottore non trovato' });

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_DOTTORE',
        entita: 'dottori',
        idEntita: updated.id,
        dettagli: { campi: keys },
      });

      return updated;
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `UPDATE dottori SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Dottore non trovato' });

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'DELETE_DOTTORE',
      entita: 'dottori',
      idEntita: id,
    });
    return { status: 'ok' };
  });
}
