import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async (_req, reply) => {
    try {
      const result = await pool.query<{ now: Date }>('SELECT NOW() AS now');
      return { status: 'ok', db_time: result.rows[0]?.now };
    } catch (err) {
      app.log.error(err);
      return reply.code(503).send({ status: 'error', error: 'db unreachable' });
    }
  });
}
