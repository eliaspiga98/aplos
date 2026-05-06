import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcryptjs';

import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAdmin } from '../auth/guards.js';
import type { Ruolo } from '../auth/types.js';

const RuoloSchema = Type.Union([Type.Literal('admin'), Type.Literal('tecnico')]);
const PinSchema = Type.String({ minLength: 4, maxLength: 12, pattern: '^[0-9]+$' });

const CreateBody = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 100 }),
  ruolo: RuoloSchema,
  pin: PinSchema,
  usa_demo: Type.Optional(Type.Boolean()),
});

const UpdateBody = Type.Object({
  nome: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  ruolo: Type.Optional(RuoloSchema),
  pin: Type.Optional(PinSchema),
  usa_demo: Type.Optional(Type.Boolean()),
});

const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

interface OperatoreRow {
  id: number;
  nome: string;
  ruolo: Ruolo;
  usa_demo: boolean;
  created_at: string;
  updated_at: string;
}

export async function operatoriRoutes(app: FastifyInstance) {
  // Tutte le route operatori sono admin-only.
  app.addHook('preHandler', requireAdmin);

  app.get('/', async () => {
    const result = await pool.query<OperatoreRow>(
      `SELECT id, nome, ruolo, usa_demo, created_at, updated_at
       FROM operatori
       WHERE deleted_at IS NULL
       ORDER BY nome ASC`,
    );
    return result.rows;
  });

  app.post('/', { schema: { body: CreateBody } }, async (req, reply) => {
    const { nome, ruolo, pin, usa_demo = false } = req.body as {
      nome: string; ruolo: Ruolo; pin: string; usa_demo?: boolean;
    };
    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query<OperatoreRow>(
      `INSERT INTO operatori (nome, ruolo, pin_hash, usa_demo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, ruolo, usa_demo, created_at, updated_at`,
      [nome, ruolo, pinHash, usa_demo],
    );

    const created = result.rows[0]!;
    await logAudit(pool, {
      idOperatore: req.user!.id,
      azione: 'CREATE_OPERATORE',
      entita: 'operatori',
      idEntita: created.id,
      dettagli: { nome: created.nome, ruolo: created.ruolo, usa_demo: created.usa_demo },
    });

    return reply.code(201).send(created);
  });

  app.patch(
    '/:id',
    { schema: { params: IdParams, body: UpdateBody } },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const body = req.body as { nome?: string; ruolo?: Ruolo; pin?: string; usa_demo?: boolean };

      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;

      if (body.nome !== undefined) {
        fields.push(`nome = $${i++}`);
        values.push(body.nome);
      }
      if (body.ruolo !== undefined) {
        fields.push(`ruolo = $${i++}`);
        values.push(body.ruolo);
      }
      if (body.pin !== undefined) {
        const pinHash = await bcrypt.hash(body.pin, 10);
        fields.push(`pin_hash = $${i++}`);
        values.push(pinHash);
      }
      if (body.usa_demo !== undefined) {
        fields.push(`usa_demo = $${i++}`);
        values.push(body.usa_demo);
      }
      if (fields.length === 0) {
        return reply.code(400).send({ error: 'Nessun campo da aggiornare' });
      }
      values.push(id);

      const result = await pool.query<OperatoreRow>(
        `UPDATE operatori
         SET ${fields.join(', ')}
         WHERE id = $${i} AND deleted_at IS NULL
         RETURNING id, nome, ruolo, usa_demo, created_at, updated_at`,
        values,
      );
      const updated = result.rows[0];
      if (!updated) return reply.code(404).send({ error: 'Operatore non trovato' });

      await logAudit(pool, {
        idOperatore: req.user!.id,
        azione: 'UPDATE_OPERATORE',
        entita: 'operatori',
        idEntita: updated.id,
        dettagli: {
          campi: Object.keys(body).filter((k) => k !== 'pin'),
          pin_aggiornato: body.pin !== undefined,
          usa_demo: body.usa_demo,
        },
      });

      return updated;
    },
  );

  app.delete('/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { id } = req.params as { id: number };

    if (id === req.user!.id) {
      return reply.code(400).send({ error: 'Non puoi cancellare te stesso' });
    }

    const result = await pool.query<{ id: number }>(
      `UPDATE operatori
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Operatore non trovato' });
    }

    await logAudit(pool, {
      idOperatore: req.user!.id,
      azione: 'DELETE_OPERATORE',
      entita: 'operatori',
      idEntita: id,
    });

    return { status: 'ok' };
  });
}
