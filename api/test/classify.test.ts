import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickClassify } from '../src/ai/classify.ts';

test('verbi imperativi DATI', () => {
  assert.equal(quickClassify('Mostrami i lavori in corso'), 'sql');
  assert.equal(quickClassify('Elenca i dottori'), 'sql');
  assert.equal(quickClassify('Dammi il telefono di Rossi'), 'sql');
  assert.equal(quickClassify('Trova i materiali esauriti'), 'sql');
  assert.equal(quickClassify('Quanti lavori sono in scadenza?'), 'sql');
  assert.equal(quickClassify('Quali materiali sono sotto soglia?'), 'sql');
});

test('sostantivi del dominio come prefisso → DATI', () => {
  assert.equal(quickClassify('Lavori in scadenza'), 'sql');
  assert.equal(quickClassify('Materiali zirconio'), 'sql');
  assert.equal(quickClassify('Cialde di pmma'), 'sql');
});

test('domande informative → INFO', () => {
  assert.equal(quickClassify('Cosa significa stato in_prova?'), 'info');
  assert.equal(quickClassify('A cosa serve il PIN?'), 'info');
  assert.equal(quickClassify('Come si crea un nuovo dottore?'), 'info');
  assert.equal(quickClassify("Cos'è la notazione FDI?"), 'info');
  assert.equal(quickClassify('Spiegami il flusso dei lavori'), 'info');
});

test('pattern "del dottor X" → DATI', () => {
  assert.equal(quickClassify('Telefono del dottor Rossi'), 'sql');
  assert.equal(quickClassify('Mail della dottoressa Verdi'), 'sql');
  assert.equal(quickClassify('Lavori del paziente Bianchi'), 'sql');
});

test('domande ambigue → null (richiedono LLM)', () => {
  assert.equal(quickClassify('Come va?'), null);
  assert.equal(quickClassify('Tutto bene'), null);
  assert.equal(quickClassify('Aiuto'), null);
});

test('input vuoto → null', () => {
  assert.equal(quickClassify(''), null);
  assert.equal(quickClassify('   '), null);
});

test('punteggiatura finale ignorata', () => {
  assert.equal(quickClassify('Mostra i lavori.'), 'sql');
  assert.equal(quickClassify('Mostra i lavori!!'), 'sql');
});

test('case-insensitive sui prefissi', () => {
  assert.equal(quickClassify('MOSTRA I LAVORI'), 'sql');
  assert.equal(quickClassify('mostra i lavori'), 'sql');
  assert.equal(quickClassify('Mostra I Lavori'), 'sql');
});

test('classifica domande inglesi DATI e INFO', () => {
  assert.equal(quickClassify('Show me jobs due this week'), 'sql');
  assert.equal(quickClassify('How many materials are below threshold?'), 'sql');
  assert.equal(quickClassify('What is the phone number of Dr Smith?'), 'sql');
  assert.equal(quickClassify('How do I create a new doctor?'), 'info');
  assert.equal(quickClassify('What does try-in status mean?'), 'info');
});
