import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Decodifica il cookie di sessione e popola request.user. Non blocca se
 * mancante: serve a permettere a /api/auth/me di rispondere "non loggato"
 * senza esplodere.
 */
export async function attachUser(req: FastifyRequest): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    // ignora: req.user resterà undefined
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    return reply.code(401).send({ error: 'Non autenticato' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    return reply.code(401).send({ error: 'Non autenticato' });
  }
  if (req.user.ruolo !== 'admin') {
    return reply.code(403).send({ error: 'Operazione riservata agli amministratori' });
  }
}
