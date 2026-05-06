import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAndValidateSql } from '../src/ai/sql-guard.ts';

test('estrae SQL da fence ```sql', () => {
  const r = extractAndValidateSql('```sql\nSELECT 1\n```');
  assert.equal(r.ok, true);
  assert.equal(r.sql, 'SELECT 1');
});

test('estrae SQL da fence senza linguaggio', () => {
  const r = extractAndValidateSql('Ecco la query:\n```\nSELECT 1\n```');
  assert.equal(r.ok, true);
  assert.equal(r.sql, 'SELECT 1');
});

test('accetta query senza fence', () => {
  const r = extractAndValidateSql('SELECT * FROM lavori');
  assert.equal(r.ok, true);
});

test('accetta CTE (WITH ...)', () => {
  const r = extractAndValidateSql(
    '```sql\nWITH t AS (SELECT 1) SELECT * FROM t\n```',
  );
  assert.equal(r.ok, true);
});

test('rifiuta INSERT', () => {
  const r = extractAndValidateSql('```sql\nINSERT INTO operatori VALUES (1)\n```');
  assert.equal(r.ok, false);
});

test('rifiuta DELETE in mezzo', () => {
  const r = extractAndValidateSql(
    '```sql\nSELECT 1; DELETE FROM lavori\n```',
  );
  // tagliamo dopo il primo punto e virgola, quindi è solo SELECT 1 → ok
  assert.equal(r.ok, true);
  assert.equal(r.sql, 'SELECT 1');
});

test('rifiuta DROP nascosto', () => {
  const r = extractAndValidateSql(
    '```sql\nSELECT * FROM lavori; DROP TABLE lavori\n```',
  );
  // dopo il taglio resta SELECT * FROM lavori → accettata
  assert.equal(r.ok, true);
});

test('rifiuta UPDATE come prima statement', () => {
  const r = extractAndValidateSql('UPDATE lavori SET stato = \'finito\'');
  assert.equal(r.ok, false);
});

test('rifiuta query vuota', () => {
  const r = extractAndValidateSql('');
  assert.equal(r.ok, false);
});

test('rimuove commenti SQL', () => {
  const r = extractAndValidateSql('SELECT 1 -- commento\n');
  assert.equal(r.ok, true);
  assert.equal(r.sql?.trim(), 'SELECT 1');
});

test('blocca DROP all\'interno della query', () => {
  const r = extractAndValidateSql('SELECT * FROM (DROP TABLE x) AS t');
  assert.equal(r.ok, false);
});
