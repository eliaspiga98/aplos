import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcryptjs';

import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { SESSION_COOKIE } from '../server.js';
import type { Ruolo } from '../auth/types.js';

const LoginBody = Type.Object({
  id_operatore: Type.Integer({ minimum: 1 }),
  pin: Type.String({ minLength: 4, maxLength: 12, pattern: '^[0-9]+$' }),
});

interface OperatoreRow {
  id: number;
  nome: string;
  ruolo: Ruolo;
  pin_hash: string;
  usa_demo: boolean;
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * Lista operatori per la schermata di login (no PIN, no hash).
   * Pubblica: serve a popolare il dropdown PRIMA del login.
   */
  app.get('/operatori', async () => {
    const result = await pool.query<{ id: number; nome: string; ruolo: Ruolo }>(
      `SELECT id, nome, ruolo
       FROM operatori
       WHERE deleted_at IS NULL
       ORDER BY nome ASC`,
    );
    return result.rows;
  });

  /**
   * Login fast: id operatore + PIN. Risponde settando il cookie di sessione.
   * Risposta volutamente generica in caso di fallimento (no enumerazione).
   *
   * Rate limit per IP: 10 tentativi al minuto, per ridurre brute force su PIN
   * a 4-6 cifre.
   */
  app.post(
    '/login',
    {
      schema: { body: LoginBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
    const { id_operatore, pin } = req.body as { id_operatore: number; pin: string };

    const result = await pool.query<OperatoreRow>(
      `SELECT id, nome, ruolo, pin_hash, usa_demo
       FROM operatori
       WHERE id = $1 AND deleted_at IS NULL`,
      [id_operatore],
    );

    const op = result.rows[0];
    if (!op) {
      return reply.code(401).send({ error: 'Credenziali non valide' });
    }
    const ok = await bcrypt.compare(pin, op.pin_hash);
    if (!ok) {
      return reply.code(401).send({ error: 'Credenziali non valide' });
    }

    const token = await reply.jwtSign({
      id: op.id,
      nome: op.nome,
      ruolo: op.ruolo,
      usa_demo: op.usa_demo,
    });

    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionTtlSeconds,
    });

    await logAudit(pool, {
      idOperatore: op.id,
      azione: 'LOGIN',
      entita: 'operatori',
      idEntita: op.id,
    });

    return { id: op.id, nome: op.nome, ruolo: op.ruolo, usa_demo: op.usa_demo };
  });

  /**
   * Logout idempotente: pulisce sempre il cookie, anche se la sessione lato
   * server è scaduta o assente. Niente requireAuth: vogliamo che il client
   * possa "uscire" anche se è già fuori (es. JWT scaduto da poco).
   */
  app.post('/logout', async (req, reply) => {
    if (req.user) {
      await logAudit(pool, {
        idOperatore: req.user.id,
        azione: 'LOGOUT',
        entita: 'operatori',
        idEntita: req.user.id,
      });
    }
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      secure: config.cookieSecure,
      sameSite: 'lax',
    });
    return { status: 'ok' };
  });

  app.get('/me', async (req) => {
    if (!req.user) return { user: null };
    return { user: req.user };
  });

  /**
   * Cambio PIN self-service. Verifica il PIN attuale prima di consentire la
   * modifica.
   */
  app.post(
    '/me/pin',
    {
      preHandler: requireAuth,
      schema: {
        body: Type.Object({
          pin_attuale: Type.String({ minLength: 4, maxLength: 12, pattern: '^[0-9]+$' }),
          pin_nuovo: Type.String({ minLength: 4, maxLength: 12, pattern: '^[0-9]+$' }),
        }),
      },
    },
    async (req, reply) => {
      const { pin_attuale, pin_nuovo } = req.body as { pin_attuale: string; pin_nuovo: string };
      if (pin_attuale === pin_nuovo) {
        return reply.code(400).send({ error: 'Il nuovo PIN deve essere diverso da quello attuale' });
      }

      const result = await pool.query<OperatoreRow>(
        `SELECT id, nome, ruolo, pin_hash FROM operatori WHERE id = $1 AND deleted_at IS NULL`,
        [req.user!.id],
      );
      const op = result.rows[0];
      if (!op) return reply.code(404).send({ error: 'Operatore non trovato' });

      const ok = await bcrypt.compare(pin_attuale, op.pin_hash);
      if (!ok) return reply.code(401).send({ error: 'PIN attuale errato' });

      const newHash = await bcrypt.hash(pin_nuovo, 10);
      await pool.query(`UPDATE operatori SET pin_hash = $1 WHERE id = $2`, [newHash, op.id]);

      await logAudit(pool, {
        idOperatore: op.id,
        azione: 'CAMBIO_PIN',
        entita: 'operatori',
        idEntita: op.id,
      });

      return { status: 'ok' };
    },
  );
}
