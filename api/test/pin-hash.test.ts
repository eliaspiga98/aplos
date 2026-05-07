import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

// Round-trip del PIN. Il rischio che intercetto: leading-zero (PIN '0123')
// trattato come numero, oppure normalizzazioni inattese di bcryptjs.

test('hash + compare round-trip su PIN a 4 cifre', async () => {
  const hash = await bcrypt.hash('1234', 10);
  assert.equal(await bcrypt.compare('1234', hash), true);
  assert.equal(await bcrypt.compare('4321', hash), false);
});

test('hash preserva i leading zero', async () => {
  const hash = await bcrypt.hash('0123', 10);
  assert.equal(await bcrypt.compare('0123', hash), true);
  assert.equal(await bcrypt.compare('123', hash), false);
});

test('hash distingue PIN visivamente simili (0 vs O sarebbe stato un problema, ma sono numerici)', async () => {
  const hash = await bcrypt.hash('1111', 10);
  assert.equal(await bcrypt.compare('11111', hash), false);
  assert.equal(await bcrypt.compare('1110', hash), false);
});

test('hash genera output diverso per la stessa password (salt casuale)', async () => {
  const a = await bcrypt.hash('1234', 10);
  const b = await bcrypt.hash('1234', 10);
  assert.notEqual(a, b);
  // ma entrambi devono validare lo stesso PIN
  assert.equal(await bcrypt.compare('1234', a), true);
  assert.equal(await bcrypt.compare('1234', b), true);
});

test('PIN al limite max (12 cifre) gestito correttamente', async () => {
  const longPin = '123456789012';
  const hash = await bcrypt.hash(longPin, 10);
  assert.equal(await bcrypt.compare(longPin, hash), true);
});
