import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { configurePostgresDateParser } from '../src/db/date-types.ts';

test('PostgreSQL DATE resta una stringa civile senza shift di fuso', () => {
  configurePostgresDateParser();
  const parser = pg.types.getTypeParser(1082, 'text');
  assert.equal(parser('2026-09-09'), '2026-09-09');
});
