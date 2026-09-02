import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextMaintenanceDate } from '../src/maintenance-schedule.ts';

test('ricorrenza giornaliera salta le occorrenze arretrate', () => {
  assert.equal(nextMaintenanceDate('2026-08-01', 10, 'giorni', new Date('2026-09-01T12:00:00Z')), '2026-09-10');
});

test('ricorrenza mensile mantiene la cadenza originaria', () => {
  assert.equal(nextMaintenanceDate('2026-07-15', 1, 'mesi', new Date('2026-09-01T12:00:00Z')), '2026-09-15');
});

test('ricorrenza annuale restituisce la prima data futura', () => {
  assert.equal(nextMaintenanceDate('2024-05-10', 1, 'anni', new Date('2026-09-01T12:00:00Z')), '2027-05-10');
});

test('completamento anticipato avanza comunque alla ricorrenza successiva', () => {
  assert.equal(nextMaintenanceDate('2026-10-15', 1, 'mesi', new Date('2026-09-01T12:00:00Z')), '2026-11-15');
});

test('ricorrenza mensile non salta febbraio partendo dal giorno 31', () => {
  assert.equal(nextMaintenanceDate('2027-01-31', 1, 'mesi', new Date('2027-01-01T12:00:00Z')), '2027-02-28');
});

test('ricorrenza annuale gestisce il 29 febbraio', () => {
  assert.equal(nextMaintenanceDate('2028-02-29', 1, 'anni', new Date('2028-01-01T12:00:00Z')), '2029-02-28');
});

test('accetta la data civile del database senza dipendere dal fuso del server', () => {
  assert.equal(nextMaintenanceDate('2026-09-01', 1, 'giorni', '2026-09-01'), '2026-09-02');
});
