import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logAudit } from '../src/audit.ts';

// Mock minimale di un pg.Pool / pg.PoolClient — solo .query.
function makeRunner() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const runner = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  return { runner, calls };
}

test('logAudit serializza dettagli come JSON e mappa i campi opzionali', async () => {
  const { runner, calls } = makeRunner();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await logAudit(runner as any, {
    idOperatore: 7,
    azione: 'CAMBIO_STATO_LAVORO',
    entita: 'lavori',
    idEntita: 42,
    dettagli: { da: 'in_corso', a: 'finito' },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /INSERT INTO audit_log/);
  const [idOp, azione, entita, idEnt, dettJson] = calls[0]!.params;
  assert.equal(idOp, 7);
  assert.equal(azione, 'CAMBIO_STATO_LAVORO');
  assert.equal(entita, 'lavori');
  assert.equal(idEnt, 42);
  assert.deepEqual(JSON.parse(dettJson as string), { da: 'in_corso', a: 'finito' });
});

test('logAudit usa null per entita/idEntita se omessi', async () => {
  const { runner, calls } = makeRunner();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await logAudit(runner as any, {
    idOperatore: 1,
    azione: 'LOGIN',
  });
  assert.equal(calls[0]!.params[2], null);
  assert.equal(calls[0]!.params[3], null);
  assert.equal(calls[0]!.params[4], '{}');
});

test('logAudit accetta idOperatore null (azione di sistema)', async () => {
  const { runner, calls } = makeRunner();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await logAudit(runner as any, {
    idOperatore: null,
    azione: 'BACKUP',
  });
  assert.equal(calls[0]!.params[0], null);
});
