import assert from 'node:assert/strict';
import test from 'node:test';

import { isBackupDue } from '../src/db/backup-schedule.js';

const now = new Date('2026-08-31T12:00:00.000Z');

test('backup disabilitato non è mai dovuto', () => {
  assert.equal(isBackupDue('disabled', null, now), false);
});

test('backup senza esecuzioni precedenti è subito dovuto', () => {
  assert.equal(isBackupDue('daily', null, now), true);
  assert.equal(isBackupDue('weekly', null, now), true);
});

test('backup giornaliero rispetta le 24 ore', () => {
  assert.equal(isBackupDue('daily', '2026-08-30T13:00:00.000Z', now), false);
  assert.equal(isBackupDue('daily', '2026-08-30T12:00:00.000Z', now), true);
});

test('backup settimanale rispetta i 7 giorni', () => {
  assert.equal(isBackupDue('weekly', '2026-08-25T12:00:00.000Z', now), false);
  assert.equal(isBackupDue('weekly', '2026-08-24T12:00:00.000Z', now), true);
});
