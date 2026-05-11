import './auth/types.js';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { config } from './config.js';
import { attachUser } from './auth/guards.js';
import { pool, demoPool } from './db/pool.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { operatoriRoutes } from './routes/operatori.js';
import { dottoriRoutes } from './routes/dottori.js';
import { lavoriRoutes } from './routes/lavori.js';
import { materialiRoutes } from './routes/materiali.js';
import { depositiRoutes } from './routes/depositi.js';
import { allegatiRoutes } from './routes/allegati.js';
import { aiRoutes } from './routes/ai.js';
import { adminSettingsRoutes } from './routes/admin-settings.js';
import { llmWarmup } from './ai/llm.js';

const SESSION_COOKIE = 'aplos_session';

async function buildServer() {
  const app = Fastify({
    logger: {
      transport: config.isProduction
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
    exposedHeaders: ['x-total-count'],
  });
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: `${config.sessionTtlSeconds}s` },
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.uploadMaxBytes,
      files: 1,
    },
  });
  // Rate limit globale di sicurezza. Le route specifiche (es. login) possono
  // sovrascrivere con limiti più stretti via `config.rateLimit`.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  // Decodifica il cookie di sessione su ogni richiesta (best-effort).
  app.addHook('onRequest', attachUser);

  // Seleziona la pool DB in base al flag usa_demo dell'operatore loggato.
  // Se l'utente non è loggato, la pool principale (le route che richiedono
  // auth si fermeranno comunque al guard).
  app.addHook('onRequest', async (req) => {
    if (req.user?.usa_demo && demoPool) {
      req.pool = demoPool;
    } else {
      req.pool = pool;
    }
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(operatoriRoutes, { prefix: '/api/operatori' });
  await app.register(dottoriRoutes, { prefix: '/api/dottori' });
  await app.register(lavoriRoutes, { prefix: '/api/lavori' });
  await app.register(materialiRoutes, { prefix: '/api/materiali' });
  await app.register(depositiRoutes, { prefix: '/api/depositi' });
  await app.register(allegatiRoutes, { prefix: '/api' });
  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(adminSettingsRoutes, { prefix: '/api/admin/settings' });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Pre-warm LLM in background — non blocca lo start dell'API.
  // Caricare il modello in memoria evita che il primo utente paghi un
  // cold start di ~15-30s. Se il provider non è raggiungibile (es. spento)
  // logghiamo un warning ma il server resta up.
  llmWarmup().then(
    () => app.log.info('LLM pre-warm completato'),
    (err) => app.log.warn({ err: err instanceof Error ? err.message : err }, 'LLM pre-warm fallito (continua senza)'),
  );
}

start();

export { SESSION_COOKIE };
