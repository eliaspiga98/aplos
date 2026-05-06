import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidFDIToothNumber, validateToothArray } from '../src/validators.ts';

test('isValidFDIToothNumber accetta i denti permanenti 11-48', () => {
  for (const q of [1, 2, 3, 4]) {
    for (let p = 1; p <= 8; p++) {
      assert.equal(isValidFDIToothNumber(q * 10 + p), true, `${q * 10 + p}`);
    }
  }
});

test('isValidFDIToothNumber accetta i denti decidui 51-85', () => {
  for (const q of [5, 6, 7, 8]) {
    for (let p = 1; p <= 5; p++) {
      assert.equal(isValidFDIToothNumber(q * 10 + p), true, `${q * 10 + p}`);
    }
  }
});

test('isValidFDIToothNumber rifiuta numeri fuori range', () => {
  assert.equal(isValidFDIToothNumber(0), false);
  assert.equal(isValidFDIToothNumber(10), false); // posizione 0
  assert.equal(isValidFDIToothNumber(19), false); // posizione 9 inesistente
  assert.equal(isValidFDIToothNumber(49), false); // quadrante 4 max 8
  assert.equal(isValidFDIToothNumber(56), false); // deciduo q5 max 5
  assert.equal(isValidFDIToothNumber(91), false); // quadrante inesistente
  assert.equal(isValidFDIToothNumber(11.5), false); // non intero
});

test('validateToothArray segnala array vuoto', () => {
  assert.match(validateToothArray([]) ?? '', /Nessun dente/);
});

test('validateToothArray segnala duplicati', () => {
  assert.match(validateToothArray([12, 13, 12]) ?? '', /duplicat/i);
});

test('validateToothArray segnala numero non valido', () => {
  assert.match(validateToothArray([12, 99]) ?? '', /non valido/);
});

test('validateToothArray accetta array corretto', () => {
  assert.equal(validateToothArray([12, 13, 14]), null);
});
