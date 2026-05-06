import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { mkdir, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// uploadsDir è relativo alla root del progetto (un livello sopra api/).
const UPLOADS_ROOT = resolve(__dirname, '../../..', config.uploadsDir);

const IdLavoroParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });
const AllegatoParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  idAllegato: Type.Integer({ minimum: 1 }),
});

interface AllegatoRow {
  id: number;
  id_lavoro: number;
  nome_file: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: string | null;
  created_at: string;
}

export async function allegatiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * Upload allegato. Endpoint multipart: il client manda un singolo file nel
   * field "file". Il file viene salvato in var/uploads/<id_lavoro>/<uuid><ext>
   * e la riga in lavori_allegati conserva il nome originale.
   */
  app.post(
    '/lavori/:id/allegati',
    { schema: { params: IdLavoroParams } },
    async (req, reply) => {
      const { id } = req.params as { id: number };

      const lavoroExists = await req.pool.query(
        `SELECT 1 FROM lavori WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (lavoroExists.rowCount === 0) {
        return reply.code(404).send({ error: 'Lavoro non trovato' });
      }

      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: 'Nessun file inviato' });
      }

      const dir = join(UPLOADS_ROOT, String(id));
      await mkdir(dir, { recursive: true });
      const ext = extname(data.filename);
      const storedName = `${randomUUID()}${ext}`;
      const fullPath = join(dir, storedName);
      const relPath = join(String(id), storedName);

      try {
        await pipeline(data.file, createWriteStream(fullPath));
      } catch (err) {
        // Se durante lo stream si supera il limite, multipart segnala
        // file.truncated=true. Cancelliamo il file parziale.
        try { await unlink(fullPath); } catch {}
        throw err;
      }

      if (data.file.truncated) {
        try { await unlink(fullPath); } catch {}
        return reply.code(413).send({
          error: `File troppo grande (max ${config.uploadMaxBytes} bytes)`,
        });
      }

      const sizeBytes = (data.file as unknown as { bytesRead?: number }).bytesRead ?? null;

      const result = await req.pool.query<AllegatoRow>(
        `INSERT INTO lavori_allegati
           (id_lavoro, nome_file, storage_path, mime_type, size_bytes, id_operatore)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, id_lavoro, nome_file, storage_path, mime_type, size_bytes, created_at`,
        [id, data.filename, relPath, data.mimetype, sizeBytes, req.user!.id],
      );

      const created = result.rows[0]!;
      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'UPLOAD_ALLEGATO',
        entita: 'lavori_allegati',
        idEntita: created.id,
        dettagli: { id_lavoro: id, nome_file: data.filename, mime_type: data.mimetype },
      });

      return reply.code(201).send({
        id: created.id,
        nome_file: created.nome_file,
        mime_type: created.mime_type,
        size_bytes: created.size_bytes,
        created_at: created.created_at,
      });
    },
  );

  /**
   * Download allegato. Mantiene il nome file originale.
   */
  app.get(
    '/lavori/:id/allegati/:idAllegato',
    { schema: { params: AllegatoParams } },
    async (req, reply) => {
      const { id, idAllegato } = req.params as { id: number; idAllegato: number };
      const result = await req.pool.query<AllegatoRow>(
        `SELECT * FROM lavori_allegati WHERE id = $1 AND id_lavoro = $2`,
        [idAllegato, id],
      );
      const row = result.rows[0];
      if (!row) return reply.code(404).send({ error: 'Allegato non trovato' });

      const fullPath = join(UPLOADS_ROOT, row.storage_path);
      reply
        .header('Content-Disposition', `attachment; filename="${row.nome_file.replace(/"/g, '')}"`)
        .type(row.mime_type ?? 'application/octet-stream');
      return reply.send(createReadStream(fullPath));
    },
  );

  app.delete(
    '/lavori/:id/allegati/:idAllegato',
    { schema: { params: AllegatoParams } },
    async (req, reply) => {
      const { id, idAllegato } = req.params as { id: number; idAllegato: number };
      const result = await req.pool.query<AllegatoRow>(
        `DELETE FROM lavori_allegati WHERE id = $1 AND id_lavoro = $2 RETURNING storage_path`,
        [idAllegato, id],
      );
      const row = result.rows[0];
      if (!row) return reply.code(404).send({ error: 'Allegato non trovato' });

      const fullPath = join(UPLOADS_ROOT, row.storage_path);
      try { await unlink(fullPath); } catch {
        // file già rimosso dal filesystem? log e prosegui
        req.log.warn({ fullPath }, 'file allegato già rimosso dal filesystem');
      }

      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'DELETE_ALLEGATO',
        entita: 'lavori_allegati',
        idEntita: idAllegato,
        dettagli: { id_lavoro: id },
      });

      return { status: 'ok' };
    },
  );
}
