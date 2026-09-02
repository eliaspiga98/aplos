import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkPdfPages,
  extractPdfPages,
  rankDocumentChunks,
  searchTerms,
  type SearchableDocumentChunk,
} from '../src/document-knowledge.js';

function makePdf(text: string): Uint8Array {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${escaped}) Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}

test('estrae testo e numero pagina da un PDF reale', async () => {
  const pages = await extractPdfPages(makePdf('Protocollo zirconio: sinterizzare a temperatura controllata.'));
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.page, 1);
  assert.match(pages[0]?.text ?? '', /Protocollo zirconio/);
});

test('suddivide il testo mantenendo pagina e sovrapposizione', () => {
  const text = Array.from({ length: 80 }, (_, index) => `Passaggio ${index} del protocollo.`).join(' ');
  const chunks = chunkPdfPages([{ page: 3, text }], 300, 40);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.page === 3));
  assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_, index) => index));
});

test('ordina prima il frammento pertinente alla domanda', () => {
  const base = {
    index: 0,
    page: 1,
    categoryId: 1,
    categoryName: 'Protocolli',
  };
  const chunks: SearchableDocumentChunk[] = [
    { ...base, id: 1, documentId: 10, documentTitle: 'Ceramica', text: 'Applicare la ceramica e completare la rifinitura.' },
    { ...base, id: 2, documentId: 11, documentTitle: 'Zirconio', text: 'La sinterizzazione dello zirconio richiede il ciclo termico previsto.' },
  ];
  const ranked = rankDocumentChunks(chunks, 'Qual è il passaggio di sinterizzazione dello zirconio?');
  assert.equal(ranked[0]?.documentId, 11);
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
});

test('rimuove parole comuni e accenti dai termini di ricerca', () => {
  assert.deepEqual(searchTerms('Qual è la modalità per la rifinitura?'), ['modalita', 'rifinitura']);
});
