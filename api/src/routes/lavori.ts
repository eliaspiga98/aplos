import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { withTx } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { isVitaShade, validateToothArray } from '../validators.js';
import { rowsToCsv, csvFilename } from '../csv.js';
import {
  registerMaterialUsage,
  type MaterialUsageInput,
} from '../material-usage.js';

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

const AssegnazioneInput = Type.Object({
  id_collaboratore: Type.Integer({ minimum: 1 }),
  mansione: Type.String({ minLength: 1, maxLength: 120 }),
});

const MaterialUsageInputBody = Type.Object({
  id_materiale: Type.Integer({ minimum: 1 }),
  stato_prelievo: Type.Optional(Type.Union([
    Type.Literal('nuovo'),
    Type.Literal('parziale'),
  ])),
  quantita_usata: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  note: Type.Optional(Type.String({ maxLength: 500 })),
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
  materiali: Type.Optional(Type.Array(MaterialUsageInputBody, { maxItems: 50 })),
});

const UpdateBody = Type.Partial(
  Type.Omit(CreateBody, ['strutture']),
);

const StatoBody = Type.Object({
  stato: StatoLavoro,
  assegnazioni: Type.Optional(Type.Array(AssegnazioneInput, { maxItems: 20 })),
});

const ListQuery = Type.Object({
  q: Type.Optional(Type.String()),
  stato: Type.Optional(StatoLavoro),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const UPDATE_KEYS = [
  'id_dottore', 'nome_paziente', 'data_entrata', 'data_consegna', 'stato',
  'scala_colori', 'tipologia_lavoro', 'note_istruzioni',
] as const;
const AssegnazioniBody = Type.Object({
  assegnazioni: Type.Array(AssegnazioneInput, { maxItems: 20 }),
});

const RegistraMaterialeBody = MaterialUsageInputBody;

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
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', a.id,
                 'id_collaboratore', a.id_collaboratore,
                 'collaboratore_nome', c.nome,
                 'mansione', a.mansione,
                 'assegnato_at', a.assegnato_at
               ) ORDER BY a.assegnato_at)
               FROM lavori_assegnazioni a
               JOIN collaboratori c ON c.id = a.id_collaboratore
               WHERE a.id_lavoro = l.id AND a.rimosso_at IS NULL
             ), '[]'::json) AS assegnazioni,
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

    const [strutture, allegati, materiali, assegnazioni] = await Promise.all([
      req.pool.query(
        `SELECT id, tipo_struttura, elementi_dentali
         FROM lavori_strutture WHERE id_lavoro = $1
         ORDER BY id ASC`,
        [id],
      ),
      req.pool.query(
        `SELECT id, nome_file, mime_type, size_bytes, created_at
         FROM lavori_allegati WHERE id_lavoro = $1
         ORDER BY created_at DESC`,
        [id],
      ),
      req.pool.query(
        `SELECT lm.id, lm.quantita_usata, lm.unita_misura, lm.note, lm.created_at,
                lm.stato_prelievo,
                m.id AS id_materiale, m.categoria, m.lotto, m.marca, m.colore,
                d.nome AS deposito_nome
         FROM lavori_materiali lm
         JOIN materiali m ON m.id = lm.id_materiale
         LEFT JOIN depositi d ON d.id = m.id_deposito
         WHERE lm.id_lavoro = $1
         ORDER BY lm.created_at DESC`,
        [id],
      ),
      req.pool.query(
        `SELECT a.id, a.id_collaboratore, c.nome AS collaboratore_nome,
                a.mansione, a.assegnato_at, a.rimosso_at,
                a.id_operatore_assegnazione, oa.nome AS operatore_assegnazione_nome,
                a.id_operatore_rimozione, ore.nome AS operatore_rimozione_nome
         FROM lavori_assegnazioni a
         JOIN collaboratori c ON c.id = a.id_collaboratore
         LEFT JOIN operatori oa ON oa.id = a.id_operatore_assegnazione
         LEFT JOIN operatori ore ON ore.id = a.id_operatore_rimozione
         WHERE a.id_lavoro = $1
         ORDER BY (a.rimosso_at IS NULL) DESC, a.assegnato_at DESC`,
        [id],
      ),
    ]);

    return {
      ...row,
      strutture: strutture.rows,
      allegati: allegati.rows,
      materiali: materiali.rows,
      assegnazioni: assegnazioni.rows,
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
      materiali?: MaterialUsageInput[];
    };

    const shade = b.scala_colori?.trim() || null;
    if (shade && !isVitaShade(shade)) {
      return reply.code(400).send({ error: 'Colore VITA non valido' });
    }

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
          shade, b.tipologia_lavoro ?? null, b.note_istruzioni ?? null,
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

      for (const material of b.materiali ?? []) {
        const usage = await registerMaterialUsage(client, {
          ...material,
          id_lavoro: Number(lavoro.id),
          id_operatore: req.user!.id,
        });
        await logAudit(client, {
          idOperatore: req.user!.id,
          azione: 'REGISTRA_MATERIALE',
          entita: 'lavori_materiali',
          idEntita: Number(usage.id),
          dettagli: {
            id_lavoro: Number(lavoro.id),
            id_materiale: material.id_materiale,
            stato_prelievo: usage.stato_prelievo ?? null,
            quantita: usage.quantita_usata ?? 1,
          },
        });
      }

      await logAudit(client, {
        idOperatore: req.user!.id,
        azione: 'CREATE_LAVORO',
        entita: 'lavori',
        idEntita: Number(lavoro.id),
        dettagli: {
          paziente: String(lavoro.nome_paziente),
          n_strutture: b.strutture?.length ?? 0,
          n_materiali: b.materiali?.length ?? 0,
        },
      });
      return lavoro;
    });

    return reply.code(201).send(created);
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: UpdateBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const body = req.body as Record<string, unknown>;
      const nuoviMateriali = (body.materiali ?? []) as MaterialUsageInput[];
      const keys = UPDATE_KEYS.filter((key) => body[key] !== undefined);
      if (keys.length === 0 && nuoviMateriali.length === 0) {
        return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
      }

      if (typeof body.scala_colori === 'string') {
        body.scala_colori = body.scala_colori.trim() || null;
      }
      if (typeof body.scala_colori === 'string' && !isVitaShade(body.scala_colori)) {
        const previous = await req.pool.query<{ scala_colori: string | null }>(
          `SELECT scala_colori FROM lavori WHERE id = $1 AND deleted_at IS NULL`,
          [id],
        );
        if (!previous.rows[0]) return reply.code(404).send({ error: 'Lavoro non trovato' });
        if (previous.rows[0].scala_colori !== body.scala_colori) {
          return reply.code(400).send({ error: 'Colore VITA non valido' });
        }
      }

      const updated = await withTx(req.pool, async (client) => {
        const before = await client.query(
          `SELECT * FROM lavori WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [id],
        );
        if (!before.rows[0]) return null;

        let lavoro = before.rows[0];
        if (keys.length > 0) {
          const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
          const values = keys.map((k) => body[k]);
          values.push(id);
          const result = await client.query(
            `UPDATE lavori SET ${setSql}
             WHERE id = $${keys.length + 1}
             RETURNING *`,
            values,
          );
          lavoro = result.rows[0];
        }

        for (const material of nuoviMateriali) {
          const usage = await registerMaterialUsage(client, {
            ...material,
            id_lavoro: id,
            id_operatore: req.user!.id,
          });
          await logAudit(client, {
            idOperatore: req.user!.id,
            azione: 'REGISTRA_MATERIALE',
            entita: 'lavori_materiali',
            idEntita: Number(usage.id),
            dettagli: {
              id_lavoro: id,
              id_materiale: material.id_materiale,
              stato_prelievo: usage.stato_prelievo ?? null,
              quantita: usage.quantita_usata ?? 1,
            },
          });
        }

        await logAudit(client, {
          idOperatore: req.user!.id,
          azione: 'UPDATE_LAVORO',
          entita: 'lavori',
          idEntita: id,
          dettagli: { campi: keys, materiali_aggiunti: nuoviMateriali.length },
        });
        return lavoro;
      });
      if (!updated) return reply.code(404).send({ error: 'Lavoro non trovato' });

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
      const requestBody = req.body as {
        stato: string;
        assegnazioni?: Array<{ id_collaboratore: number; mansione: string }>;
      };
      const { stato } = requestBody;
      const assignmentsProvided = requestBody.assegnazioni !== undefined;

      const normalized = (requestBody.assegnazioni ?? []).map((a) => ({
        id_collaboratore: a.id_collaboratore,
        mansione: a.mansione.trim(),
      }));
      if (normalized.some((a) => a.mansione.length === 0)) {
        return reply.code(400).send({ error: 'La mansione non può essere vuota' });
      }
      const desiredKeys = new Set(normalized.map((a) => `${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
      if (desiredKeys.size !== normalized.length) {
        return reply.code(400).send({ error: 'La stessa assegnazione è presente più volte' });
      }
      const collaboratorIds = [...new Set(normalized.map((a) => a.id_collaboratore))];
      if (collaboratorIds.length > 0) {
        const active = await req.pool.query<{ id: number }>(
          `SELECT id FROM collaboratori WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
          [collaboratorIds],
        );
        if (active.rows.length !== collaboratorIds.length) {
          return reply.code(400).send({ error: 'Uno o più collaboratori non sono disponibili' });
        }
      }

      const updated = await withTx(req.pool, async (client) => {
        const before = await client.query<{ stato: string }>(
          `SELECT stato FROM lavori WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [id],
        );
        const prev = before.rows[0];
        if (!prev) return null;

        const result = await client.query(
          `UPDATE lavori SET stato = $1 WHERE id = $2 RETURNING *`,
          [stato, id],
        );
        if (assignmentsProvided) {
          const current = await client.query<{ id: number; id_collaboratore: number; mansione: string }>(
            `SELECT id, id_collaboratore, mansione FROM lavori_assegnazioni
             WHERE id_lavoro = $1 AND rimosso_at IS NULL FOR UPDATE`,
            [id],
          );
          const currentKeys = new Set(current.rows.map((a) => `${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
          const toRemove = current.rows.filter((a) => !desiredKeys.has(`${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
          if (toRemove.length > 0) {
            await client.query(
              `UPDATE lavori_assegnazioni
               SET rimosso_at = NOW(), id_operatore_rimozione = $1
               WHERE id = ANY($2::bigint[])`,
              [req.user!.id, toRemove.map((a) => a.id)],
            );
          }
          for (const assignment of normalized) {
            const key = `${assignment.id_collaboratore}:${assignment.mansione.toLocaleLowerCase('it')}`;
            if (!currentKeys.has(key)) {
              await client.query(
                `INSERT INTO lavori_assegnazioni
                   (id_lavoro, id_collaboratore, mansione, id_operatore_assegnazione)
                 VALUES ($1,$2,$3,$4)`,
                [id, assignment.id_collaboratore, assignment.mansione, req.user!.id],
              );
            }
          }
          await logAudit(client, {
            idOperatore: req.user!.id,
            azione: 'UPDATE_ASSEGNAZIONI_LAVORO',
            entita: 'lavori',
            idEntita: id,
            dettagli: { attive: normalized.length, rimosse: toRemove.length },
          });
        }
        await logAudit(client, {
          idOperatore: req.user!.id,
          azione: 'CAMBIO_STATO_LAVORO',
          entita: 'lavori',
          idEntita: id,
          dettagli: { da: prev.stato, a: stato },
        });
        return result.rows[0];
      });
      if (!updated) return reply.code(404).send({ error: 'Lavoro non trovato' });
      return updated;
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const deleted = await withTx(req.pool, async (client) => {
      const result = await client.query(
        `UPDATE lavori SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) return null;
      const assignments = await client.query(
        `UPDATE lavori_assegnazioni
         SET rimosso_at = NOW(), id_operatore_rimozione = $1
         WHERE id_lavoro = $2 AND rimosso_at IS NULL
         RETURNING id`,
        [req.user!.id, id],
      );
      await logAudit(client, {
        idOperatore: req.user!.id,
        azione: 'DELETE_LAVORO',
        entita: 'lavori',
        idEntita: id,
        dettagli: { assegnazioni_chiuse: assignments.rowCount ?? 0 },
      });
      return true;
    });
    if (!deleted) return reply.code(404).send({ error: 'Lavoro non trovato' });
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

  app.put(
    '/:id/assegnazioni',
    { schema: { params: IdParams, body: AssegnazioniBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const { assegnazioni } = req.body as {
        assegnazioni: Array<{ id_collaboratore: number; mansione: string }>;
      };
      const desired = assegnazioni.map((a) => ({
        id_collaboratore: a.id_collaboratore,
        mansione: a.mansione.trim(),
      }));
      if (desired.some((a) => a.mansione.length === 0)) {
        return reply.code(400).send({ error: 'La mansione non può essere vuota' });
      }
      const desiredKeys = new Set(desired.map((a) => `${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
      if (desiredKeys.size !== desired.length) {
        return reply.code(400).send({ error: 'La stessa assegnazione è presente più volte' });
      }

      const collaboratorIds = [...new Set(desired.map((a) => a.id_collaboratore))];
      if (collaboratorIds.length > 0) {
        const active = await req.pool.query<{ id: number }>(
          `SELECT id FROM collaboratori WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
          [collaboratorIds],
        );
        if (active.rows.length !== collaboratorIds.length) {
          return reply.code(400).send({ error: 'Uno o più collaboratori non sono disponibili' });
        }
      }

      const rows = await withTx(req.pool, async (client) => {
        const exists = await client.query(
          `SELECT 1 FROM lavori WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [id],
        );
        if (exists.rowCount === 0) return null;
        const current = await client.query<{ id: number; id_collaboratore: number; mansione: string }>(
          `SELECT id, id_collaboratore, mansione FROM lavori_assegnazioni
           WHERE id_lavoro = $1 AND rimosso_at IS NULL FOR UPDATE`,
          [id],
        );
        const currentKeys = new Set(current.rows.map((a) => `${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
        const toRemove = current.rows.filter((a) => !desiredKeys.has(`${a.id_collaboratore}:${a.mansione.toLocaleLowerCase('it')}`));
        if (toRemove.length > 0) {
          await client.query(
            `UPDATE lavori_assegnazioni
             SET rimosso_at = NOW(), id_operatore_rimozione = $1
             WHERE id = ANY($2::bigint[])`,
            [req.user!.id, toRemove.map((a) => a.id)],
          );
        }
        for (const assignment of desired) {
          const key = `${assignment.id_collaboratore}:${assignment.mansione.toLocaleLowerCase('it')}`;
          if (!currentKeys.has(key)) {
            await client.query(
              `INSERT INTO lavori_assegnazioni
                 (id_lavoro, id_collaboratore, mansione, id_operatore_assegnazione)
               VALUES ($1,$2,$3,$4)`,
              [id, assignment.id_collaboratore, assignment.mansione, req.user!.id],
            );
          }
        }
        await logAudit(client, {
          idOperatore: req.user!.id,
          azione: 'UPDATE_ASSEGNAZIONI_LAVORO',
          entita: 'lavori',
          idEntita: id,
          dettagli: { attive: desired.length, rimosse: toRemove.length },
        });
        const fresh = await client.query(
          `SELECT a.id, a.id_collaboratore, c.nome AS collaboratore_nome,
                  a.mansione, a.assegnato_at, a.rimosso_at
           FROM lavori_assegnazioni a
           JOIN collaboratori c ON c.id = a.id_collaboratore
           WHERE a.id_lavoro = $1 AND a.rimosso_at IS NULL
           ORDER BY a.assegnato_at DESC`,
          [id],
        );
        return fresh.rows;
      });
      if (!rows) return reply.code(404).send({ error: 'Lavoro non trovato' });
      return rows;
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
      const b = req.body as MaterialUsageInput;

      const usage = await withTx(req.pool, async (client) => {
        const lavoroExists = await client.query(
          `SELECT 1 FROM lavori WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [id],
        );
        if (lavoroExists.rowCount === 0) return null;

        const created = await registerMaterialUsage(client, {
          ...b,
          id_lavoro: id,
          id_operatore: req.user!.id,
        });
        await logAudit(client, {
          idOperatore: req.user!.id,
          azione: 'REGISTRA_MATERIALE',
          entita: 'lavori_materiali',
          idEntita: Number(created.id),
          dettagli: {
            id_lavoro: id,
            id_materiale: b.id_materiale,
            stato_prelievo: created.stato_prelievo ?? null,
            quantita: created.quantita_usata ?? 1,
          },
        });
        return created;
      });
      if (!usage) return reply.code(404).send({ error: 'Lavoro non trovato' });

      return reply.code(201).send(usage);
    },
  );
}
