import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { pool, withTx } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { validateToothArray } from '../validators.js';
import { rowsToCsv, csvFilename } from '../csv.js';

const StatoLavoro = Type.Union([
  Type.Literal('in_attesa'),
  Type.Literal('in_corso'),
  Type.Literal('in_prova'),
  Type.Literal('finito'),
]);

const TipoStruttura = Type.Union([
  Type.Literal('corona_singola'),
  Type.Literal('ponte'),
]);

const Struttura = Type.Object({
  tipo_struttura: TipoStruttura,
  elementi_dentali: Type.Array(Type.Integer({ minimum: 11, maximum: 89 })),
});

const CreateBody = Type.Object({
  id_dottore: Type.Integer({ minimum: 1 }),
  nome_paziente: Type.String({ minLength: 1, maxLength: 200 }),
  data_entrata: Type.String({ format: 'date' }),
  data_consegna: Type.String({ format: 'date' }),
  stato: Type.Optional(StatoLavoro),
  scala_colori: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tipologia_lavoro: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  note_istruzioni: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  strutture: Type.Optional(Type.Array(Struttura)),
});

const UpdateBody = Type.Partial(
  Type.Omit(CreateBody, ['strutture']),
);

const StatoBody = Type.Object({ stato: StatoLavoro });

const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  stato: Type.Optional(StatoLavoro),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

const RegistraMaterialeBody = Type.Object({
  id_materiale: Type.Integer({ minimum: 1 }),
  quantita_usata: Type.Optional(Type.Number({ minimum: 0 })),
  unita_misura: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
});

export async function lavoriRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * Lista lavori. Search omni: prova prima a interpretare `q` come ID
   * numerico (match esatto su lavori.id), altrimenti ILIKE su paziente e
   * sul nome/studio del dottore. Ordering per data_consegna ASC, finiti
   * in coda.
   */
  app.get('/', { schema: { querystring: ListQuery } }, async (req, reply) => {
    const { q, stato, limit = 50, offset = 0 } = req.query as {
      q?: string;
      stato?: string;
      limit?: number;
      offset?: number;
    };

    const where: string[] = ['l.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (stato) {
      params.push(stato);
      where.push(`l.stato = $${params.length}`);
    }
    if (q && q.trim().length > 0) {
      const trimmed = q.trim();
      const asInt = Number(trimmed);
      if (Number.isInteger(asInt) && asInt > 0) {
        params.push(asInt);
        where.push(`l.id = $${params.length}`);
      } else {
        params.push(`%${trimmed}%`);
        const idx = params.length;
        where.push(`(l.nome_paziente ILIKE $${idx} OR d.nome ILIKE $${idx} OR d.studio ILIKE $${idx})`);
      }
    }
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    // COUNT(*) OVER () ritorna il totale insieme alle righe in un solo
    // round-trip: ogni riga porta `_total`, lo leggiamo dalla prima.
    const sql = `
      SELECT l.id, l.nome_paziente, l.data_entrata, l.data_consegna, l.stato,
             l.scala_colori, l.tipologia_lavoro,
             d.id AS id_dottore, d.nome AS dottore_nome, d.studio AS dottore_studio,
             l.created_at, l.updated_at,
             COUNT(*) OVER () AS _total
      FROM lavori l
      JOIN dottori d ON d.id = l.id_dottore
      WHERE ${where.join(' AND ')}
      ORDER BY (l.stato = 'finito') ASC, l.data_consegna ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const result = await req.pool.query<Record<string, unknown> & { _total: string }>(sql, params);
    const total = result.rows.length > 0 ? Number(result.rows[0]!._total) : 0;
    reply.header('X-Total-Count', String(total));
    return result.rows.map(({ _total: _, ...row }) => row);
  });

  /**
   * Export CSV: stessi filtri di list ma senza limit/offset (cap a 10000).
   */
  app.get('/csv', { schema: { querystring: Type.Omit(ListQuery, ['limit', 'offset']) } }, async (req, reply) => {
    const { q, stato } = req.query as { q?: string; stato?: string };
    const where: string[] = ['l.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (stato) {
      params.push(stato);
      where.push(`l.stato = $${params.length}`);
    }
    if (q && q.trim().length > 0) {
      const trimmed = q.trim();
      const asInt = Number(trimmed);
      if (Number.isInteger(asInt) && asInt > 0) {
        params.push(asInt);
        where.push(`l.id = $${params.length}`);
      } else {
        params.push(`%${trimmed}%`);
        const idx = params.length;
        where.push(`(l.nome_paziente ILIKE $${idx} OR d.nome ILIKE $${idx} OR d.studio ILIKE $${idx})`);
      }
    }

    const result = await req.pool.query<Record<string, unknown>>(
      `SELECT l.id, l.nome_paziente, d.nome AS dottore_nome, d.studio AS dottore_studio,
              l.data_entrata, l.data_consegna, l.stato, l.scala_colori, l.tipologia_lavoro,
              l.note_istruzioni
       FROM lavori l JOIN dottori d ON d.id = l.id_dottore
       WHERE ${where.join(' AND ')}
       ORDER BY l.data_consegna ASC
       LIMIT 10000`,
      params,
    );

    const cols = ['id', 'nome_paziente', 'dottore_nome', 'dottore_studio',
                  'data_entrata', 'data_consegna', 'stato', 'scala_colori',
                  'tipologia_lavoro', 'note_istruzioni'];
    const headers = ['ID', 'Paziente', 'Dottore', 'Studio',
                     'Data entrata', 'Data consegna', 'Stato', 'Colore',
                     'Tipologia', 'Istruzioni'];

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${csvFilename('lavori')}"`)
      .send(rowsToCsv(result.rows, cols, headers));
  });

  app.get('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };

    const lavoro = await req.pool.query(
      `SELECT l.*, d.nome AS dottore_nome, d.studio AS dottore_studio
       FROM lavori l
       JOIN dottori d ON d.id = l.id_dottore
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id],
    );
    const row = lavoro.rows[0];
    if (!row) return reply.code(404).send({ error: 'Lavoro non trovato' });

    const [strutture, allegati, materiali] = await Promise.all([
      pool.query(
        `SELECT id, tipo_struttura, elementi_dentali
         FROM lavori_strutture WHERE id_lavoro = $1
         ORDER BY id ASC`,
        [id],
      ),
      pool.query(
        `SELECT id, nome_file, mime_type, size_bytes, created_at
         FROM lavori_allegati WHERE id_lavoro = $1
         ORDER BY created_at DESC`,
        [id],
      ),
      pool.query(
        `SELECT lm.id, lm.quantita_usata, lm.unita_misura, lm.note, lm.created_at,
                m.id AS id_materiale, m.categoria, m.lotto, m.marca, m.colore
         FROM lavori_materiali lm
         JOIN materiali m ON m.id = lm.id_materiale
         WHERE lm.id_lavoro = $1
         ORDER BY lm.created_at DESC`,
        [id],
      ),
    ]);

    return {
      ...row,
      strutture: strutture.rows,
      allegati: allegati.rows,
      materiali: materiali.rows,
    };
  });

  app.post('/', { schema: { body: CreateBody } }, async (req, reply) => {
    const b = req.body as {
      id_dottore: number;
      nome_paziente: string;
      data_entrata: string;
      data_consegna: string;
      stato?: string;
      scala_colori?: string | null;
      tipologia_lavoro?: string | null;
      note_istruzioni?: string | null;
      strutture?: Array<{ tipo_struttura: string; elementi_dentali: number[] }>;
    };

    if (b.strutture) {
      for (const s of b.strutture) {
        const err = validateToothArray(s.elementi_dentali);
        if (err) return reply.code(400).send({ error: err });
        if (s.tipo_struttura === 'corona_singola' && s.elementi_dentali.length !== 1) {
          return reply.code(400).send({ error: 'Una corona singola deve avere esattamente 1 dente' });
        }
        if (s.tipo_struttura === 'ponte' && s.elementi_dentali.length < 2) {
          return reply.code(400).send({ error: 'Un ponte deve avere almeno 2 denti' });
        }
      }
    }

    const created = await withTx<Record<string, unknown>>(req.pool, async (client) => {
      const ins = await client.query(
        `INSERT INTO lavori
           (id_dottore, nome_paziente, data_entrata, data_consegna, stato,
            scala_colori, tipologia_lavoro, note_istruzioni, id_operatore_creazione)
         VALUES ($1,$2,$3,$4, COALESCE($5::stato_lavoro, 'in_attesa'::stato_lavoro), $6,$7,$8,$9)
         RETURNING *`,
        [
          b.id_dottore, b.nome_paziente, b.data_entrata, b.data_consegna, b.stato ?? null,
          b.scala_colori ?? null, b.tipologia_lavoro ?? null, b.note_istruzioni ?? null,
          req.user!.id,
        ],
      );
      const lavoro = ins.rows[0];

      if (b.strutture && b.strutture.length > 0) {
        for (const s of b.strutture) {
          await client.query(
            `INSERT INTO lavori_strutture (id_lavoro, tipo_struttura, elementi_dentali)
             VALUES ($1, $2, $3)`,
            [lavoro.id, s.tipo_struttura, s.elementi_dentali],
          );
        }
      }
      return lavoro;
    });

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'CREATE_LAVORO',
      entita: 'lavori',
      idEntita: created.id as number,
      dettagli: { paziente: created.nome_paziente as string, n_strutture: b.strutture?.length ?? 0 },
    });

    return reply.code(201).send(created);
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: UpdateBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const body = req.body as Record<string, unknown>;
      const keys = Object.keys(body).filter((k) => body[k] !== undefined);
      if (keys.length === 0) return reply.code(400).send({ error: 'Nessun campo da aggiornare' });

      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values = keys.map((k) => body[k]);
      values.push(id);

      const result = await req.pool.query(
        `UPDATE lavori SET ${setSql}
         WHERE id = $${keys.length + 1} AND deleted_at IS NULL
         RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      if (!updated) return reply.code(404).send({ error: 'Lavoro non trovato' });

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_LAVORO',
        entita: 'lavori',
        idEntita: updated.id,
        dettagli: { campi: keys },
      });

      return updated;
    },
  );

  /**
   * Cambio stato come endpoint dedicato: rende il log di audit ovvio e
   * permette in futuro di applicare regole specifiche (es. da "in_corso" si
   * può andare solo in "in_prova" o "finito").
   */
  app.post(
    '/:id/stato',
    { schema: { params: IdParams, body: StatoBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const { stato } = req.body as { stato: string };

      const before = await req.pool.query<{ stato: string }>(
        `SELECT stato FROM lavori WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      const prev = before.rows[0];
      if (!prev) return reply.code(404).send({ error: 'Lavoro non trovato' });

      const result = await req.pool.query(
        `UPDATE lavori SET stato = $1 WHERE id = $2 RETURNING *`,
        [stato, id],
      );

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'CAMBIO_STATO_LAVORO',
        entita: 'lavori',
        idEntita: id,
        dettagli: { da: prev.stato, a: stato },
      });

      return result.rows[0];
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const result = await req.pool.query(
      `UPDATE lavori SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Lavoro non trovato' });

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'DELETE_LAVORO',
      entita: 'lavori',
      idEntita: id,
    });
    return { status: 'ok' };
  });

  /**
   * Timeline degli eventi di un lavoro: leggiamo dall'audit_log filtrando per
   * entità "lavori" + id_entita corrispondente. Aggiungiamo il nome
   * dell'operatore tramite join.
   */
  app.get(
    '/:id/timeline',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      // operatori vive sempre nel main DB; per la timeline interna al pool
      // applicativo (req.pool) c'è una tabella operatori "speculare" anche
      // nel DB demo.
      const result = await req.pool.query(
        `SELECT a.id, a.azione, a.dettagli, a.created_at,
                a.id_operatore, o.nome AS operatore_nome
         FROM audit_log a
         LEFT JOIN operatori o ON o.id = a.id_operatore
         WHERE a.entita = 'lavori' AND a.id_entita = $1
         ORDER BY a.created_at DESC
         LIMIT 200`,
        [id],
      );
      return result.rows;
    },
  );

  /**
   * Sostituisce TUTTE le strutture di un lavoro. Operazione transazionale:
   * delete delle vecchie + insert delle nuove. Le strutture vecchie possono
   * essere cancellate fisicamente (ON DELETE CASCADE su lavori_strutture)
   * perché non hanno valore normativo MDR — la tracciabilità è in
   * lavori_materiali, che non viene toccata.
   */
  // Accettiamo anche POST /strutture per evitare il preflight CORS che alcune
  // configurazioni hanno con PUT — qui supportiamo entrambi.
  app.route({
    method: ['PUT', 'POST'],
    url: '/:id/strutture',
    schema: {
      params: IdParams,
      body: Type.Object({ strutture: Type.Array(Struttura) }),
    },
    handler: async (req, reply) => {
      const { id } = req.params as { id: number };
      const { strutture } = req.body as {
        strutture: Array<{ tipo_struttura: string; elementi_dentali: number[] }>;
      };

      for (const s of strutture) {
        const err = validateToothArray(s.elementi_dentali);
        if (err) return reply.code(400).send({ error: err });
        if (s.tipo_struttura === 'corona_singola' && s.elementi_dentali.length !== 1) {
          return reply.code(400).send({ error: 'Una corona singola deve avere esattamente 1 dente' });
        }
        if (s.tipo_struttura === 'ponte' && s.elementi_dentali.length < 2) {
          return reply.code(400).send({ error: 'Un ponte deve avere almeno 2 denti' });
        }
      }

      const result = await withTx(req.pool, async (client) => {
        const lavoroExists = await client.query(
          `SELECT 1 FROM lavori WHERE id = $1 AND deleted_at IS NULL`,
          [id],
        );
        if (lavoroExists.rowCount === 0) return null;

        await client.query(`DELETE FROM lavori_strutture WHERE id_lavoro = $1`, [id]);
        for (const s of strutture) {
          await client.query(
            `INSERT INTO lavori_strutture (id_lavoro, tipo_struttura, elementi_dentali)
             VALUES ($1, $2, $3)`,
            [id, s.tipo_struttura, s.elementi_dentali],
          );
        }
        const fresh = await client.query(
          `SELECT id, tipo_struttura, elementi_dentali
           FROM lavori_strutture WHERE id_lavoro = $1 ORDER BY id ASC`,
          [id],
        );
        return fresh.rows;
      });

      if (result === null) return reply.code(404).send({ error: 'Lavoro non trovato' });

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_STRUTTURE_LAVORO',
        entita: 'lavori',
        idEntita: id,
        dettagli: { n_strutture: strutture.length },
      });

      return result;
    },
  });

  /**
   * Registra consumo materiale su un lavoro (riga in lavori_materiali).
   * Tracciabilità MDR: questa riga non sarà mai cancellata.
   */
  app.post(
    '/:id/materiali',
    { schema: { params: IdParams, body: RegistraMaterialeBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const b = req.body as {
        id_materiale: number;
        quantita_usata?: number;
        unita_misura?: string;
        note?: string;
      };

      const lavoroExists = await req.pool.query(
        `SELECT 1 FROM lavori WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (lavoroExists.rowCount === 0) {
        return reply.code(404).send({ error: 'Lavoro non trovato' });
      }

      const result = await req.pool.query(
        `INSERT INTO lavori_materiali
           (id_lavoro, id_materiale, quantita_usata, unita_misura, note, id_operatore)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, b.id_materiale, b.quantita_usata ?? null, b.unita_misura ?? null, b.note ?? null, req.user!.id],
      );

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'REGISTRA_MATERIALE',
        entita: 'lavori_materiali',
        idEntita: result.rows[0].id,
        dettagli: { id_lavoro: id, id_materiale: b.id_materiale },
      });

      return reply.code(201).send(result.rows[0]);
    },
  );
}
