import type pg from 'pg';

export type Ruolo = 'admin' | 'tecnico';
export type Lingua = 'it' | 'en';

export interface SessionUser {
  id: number;
  nome: string;
  ruolo: Ruolo;
  /** L'operatore vede il DB demo invece di quello principale. */
  usa_demo: boolean;
  lingua: Lingua;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Pool da usare per tutte le query "applicative". Selezionata da hook
     *  in base al flag usa_demo dell'operatore. */
    pool: pg.Pool;
  }
}

// Estende l'interfaccia di @fastify/jwt per tipare il payload del JWT e
// request.user. Lasciamo `user` come `SessionUser | undefined` perché in
// fase di hook `attachUser` il jwtVerify potrebbe fallire (best-effort) e
// l'handler successivo deve poter controllare la presenza dell'utente.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser | undefined;
  }
}
