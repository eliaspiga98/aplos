import test from 'node:test';
import assert from 'node:assert/strict';

import { workStatePhase } from '../src/job-assignments.js';

test('associa soltanto le fasi in corso alla relativa lavorazione', () => {
  assert.equal(workStatePhase('in_corso_cad'), 'cad');
  assert.equal(workStatePhase('in_corso_rifinitura'), 'rifinitura');
  assert.equal(workStatePhase('in_attesa'), null);
  assert.equal(workStatePhase('attesa_rifinitura'), null);
  assert.equal(workStatePhase('in_prova'), null);
  assert.equal(workStatePhase('finito'), null);
});
