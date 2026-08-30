import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAdmin } from '../auth/guards.js';
import {
  getCurrentSettings,
  invalidateLlmCache,
  llmHealth,
  type AiSettingsRow,
} from '../ai/llm.js';
import { makeOllamaProvider } from '../ai/providers/ollama.js';
import { makeMlxProvider } from '../ai/providers/mlx.js';
import {
  ensureBackupDirectory,
  getBackupStatus,
  getDatabaseLocation,
  runDatabaseBackup,
} from '../db/backup.js';

const AiSettingsBody = Type.Object({
  ai_provider: Type.Union([Type.Literal('ollama'), Type.Literal('mlx')]),
  ai_model: Type.String({ minLength: 1, maxLength: 200 }),
  ollama_url: Type.String({ minLength: 1, maxLength: 500 }),
  mlx_url: Type.String({ minLength: 1, maxLength: 500 }),
});

const BackupSettingsBody = Type.Object({
  backup_directory: Type.String({ minLength: 1, maxLength: 1000 }),
  backup_schedule: Type.Union([
    Type.Literal('disabled'),
    Type.Literal('daily'),
    Type.Literal('weekly'),
  ]),
  backup_retention_count: Type.Integer({ minimum: 1, maximum: 365 }),
});

/**
 * Pannello admin — configurazione AI, database e backup.
 *
 * Tutte le rotte richiedono ruolo `admin`. La modifica delle settings
 * invalida la cache del dispatcher LLM, così il nuovo provider entra in uso
 * dalla richiesta successiva senza dover riavviare il server.
 */
export async function adminSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/ai', async () => {
    const s = await getCurrentSettings();
    return s;
  });

  app.put('/ai', { schema: { body: AiSettingsBody } }, async (req) => {
    const body = req.body as AiSettingsRow;
    const result = await pool.query<AiSettingsRow>(
      `UPDATE app_settings
          SET ai_provider = $1,
              ai_model    = $2,
              ollama_url  = $3,
              mlx_url     = $4,
              updated_at  = now(),
              updated_by  = $5
        WHERE id = 1
       RETURNING ai_provider, ai_model, ollama_url, mlx_url`,
      [body.ai_provider, body.ai_model, body.ollama_url, body.mlx_url, req.user!.id],
    );

    invalidateLlmCache();

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'AI_SETTINGS_UPDATE',
      dettagli: {
        ai_provider: body.ai_provider,
        ai_model: body.ai_model,
      },
    });

    return result.rows[0]!;
  });

  /**
   * Health del provider attualmente attivo (riflette le settings su DB).
   */
  app.get('/ai/health', async (_req, reply) => {
    try {
      return await llmHealth();
    } catch (err) {
      return reply.code(503).send({
        ready: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Test "what-if": misura un round-trip su un provider/URL/modello
   * specifico SENZA salvare le settings. Utile per validare la
   * configurazione prima di applicarla.
   */
  app.post('/ai/test', { schema: { body: AiSettingsBody } }, async (req, reply) => {
    const body = req.body as AiSettingsRow;
    const provider = body.ai_provider === 'mlx'
      ? makeMlxProvider({ url: body.mlx_url, model: body.ai_model })
      : makeOllamaProvider({ url: body.ollama_url, model: body.ai_model });

    const start = Date.now();
    try {
      const out = await provider.chat(
        [{ role: 'user', content: 'Rispondi solo con "ok".' }],
        { numPredict: 4 },
      );
      const ms = Date.now() - start;
      return { ok: true, ms, sample: out.trim().slice(0, 80) };
    } catch (err) {
      const ms = Date.now() - start;
      return reply.code(502).send({
        ok: false,
        ms,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/database', async () => {
    const [database, backup] = await Promise.all([
      getDatabaseLocation(),
      getBackupStatus(),
    ]);
    return { database, backup };
  });

  app.put('/database/backup', { schema: { body: BackupSettingsBody } }, async (req, reply) => {
    const body = req.body as {
      backup_directory: string;
      backup_schedule: 'disabled' | 'daily' | 'weekly';
      backup_retention_count: number;
    };

    try {
      await ensureBackupDirectory(body.backup_directory);
    } catch (error) {
      return reply.code(400).send({
        error: `La cartella di backup non è utilizzabile: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    await pool.query(
      `UPDATE app_settings
          SET backup_directory = $1,
              backup_schedule = $2,
              backup_retention_count = $3,
              updated_at = now(),
              updated_by = $4
        WHERE id = 1`,
      [
        body.backup_directory.trim(),
        body.backup_schedule,
        body.backup_retention_count,
        req.user!.id,
      ],
    );

    await logAudit(pool, {
      idOperatore: req.user!.id,
      azione: 'DATABASE_BACKUP_SETTINGS_UPDATE',
      entita: 'database',
      dettagli: body,
    });

    return getBackupStatus();
  });

  app.post('/database/backup/run', async (req, reply) => {
    try {
      const result = await runDatabaseBackup('manual', req.user!.id);
      return reply.code(201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(message.includes('già in corso') ? 409 : 500).send({ error: message });
    }
  });
}
