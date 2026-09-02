import assert from 'node:assert/strict';
import test from 'node:test';

import { materialState, planMaterialUsage } from '../src/material-inventory.js';

test('il primo utilizzo sposta una unita da nuova a parziale', () => {
  assert.deepEqual(
    planMaterialUsage({ quantitaNuova: 4, quantitaParziale: 0 }, 'nuovo', 1),
    { quantitaNuova: 3, quantitaParziale: 1, stato: 'parziale' },
  );
});

test('il materiale parziale puo essere riutilizzato senza duplicare la scorta', () => {
  assert.deepEqual(
    planMaterialUsage({ quantitaNuova: 3, quantitaParziale: 1 }, 'parziale', 1),
    { quantitaNuova: 3, quantitaParziale: 1, stato: 'parziale' },
  );
});

test('non permette di prelevare piu materiale nuovo di quello disponibile', () => {
  assert.throws(
    () => planMaterialUsage({ quantitaNuova: 1, quantitaParziale: 0 }, 'nuovo', 2),
    /Quantità nuova insufficiente/,
  );
});

test('non permette di selezionare una disponibilita parziale inesistente', () => {
  assert.throws(
    () => planMaterialUsage({ quantitaNuova: 4, quantitaParziale: 0 }, 'parziale', 1),
    /Quantità parziale insufficiente/,
  );
});

test('lo stato dipende dalle disponibilita effettive', () => {
  assert.equal(materialState(4, 0), 'nuovo');
  assert.equal(materialState(3, 1), 'parziale');
  assert.equal(materialState(0, 1), 'parziale');
  assert.equal(materialState(0, 0), 'esaurito');
});
