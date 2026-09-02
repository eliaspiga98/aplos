import { PDFParse } from 'pdf-parse';

export interface ExtractedPdfPage {
  page: number;
  text: string;
}

export interface DocumentChunk {
  index: number;
  page: number;
  text: string;
}

export interface SearchableDocumentChunk extends DocumentChunk {
  id: number;
  documentId: number;
  documentTitle: string;
  categoryId: number;
  categoryName: string;
}

export interface RankedDocumentChunk extends SearchableDocumentChunk {
  score: number;
}

const DEFAULT_CHUNK_SIZE = 1_800;
const DEFAULT_OVERLAP = 220;

const STOP_WORDS = new Set([
  'a', 'ad', 'al', 'alla', 'alle', 'allo', 'anche', 'che', 'chi', 'come', 'con',
  'da', 'dal', 'dalla', 'delle', 'di', 'e', 'ed', 'gli', 'ha', 'hai', 'ho', 'i',
  'il', 'in', 'io', 'la', 'le', 'lo', 'ma', 'mi', 'nel', 'nella', 'non', 'o',
  'per', 'piu', 'puo', 'qual', 'quale', 'quali', 'quando', 'quanto', 'se', 'si',
  'sono', 'su', 'sul', 'tra', 'un', 'una', 'uno', 'vorrei',
  'and', 'are', 'can', 'do', 'does', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'what', 'when', 'which', 'with',
]);

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Estrae il testo pagina per pagina senza inviare il PDF a servizi esterni. */
export async function extractPdfPages(data: Uint8Array): Promise<ExtractedPdfPage[]> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      page: page.num,
      text: normalizeWhitespace(page.text),
    }));
  } finally {
    await parser.destroy();
  }
}

function chooseChunkEnd(text: string, start: number, maxSize: number): number {
  const hardEnd = Math.min(text.length, start + maxSize);
  if (hardEnd === text.length) return hardEnd;

  const softStart = start + Math.floor(maxSize * 0.62);
  const candidates = [
    text.lastIndexOf('\n\n', hardEnd),
    text.lastIndexOf('. ', hardEnd),
    text.lastIndexOf('; ', hardEnd),
    text.lastIndexOf(' ', hardEnd),
  ].filter((position) => position >= softStart);

  return candidates.length > 0 ? Math.max(...candidates) + 1 : hardEnd;
}

/** Divide ogni pagina in frammenti sovrapposti, mantenendo il numero pagina. */
export function chunkPdfPages(
  pages: ExtractedPdfPage[],
  maxSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
): DocumentChunk[] {
  if (maxSize < 200) throw new Error('La dimensione del frammento deve essere almeno 200 caratteri');
  if (overlap < 0 || overlap >= maxSize) throw new Error('Sovrapposizione frammenti non valida');

  const chunks: DocumentChunk[] = [];
  let index = 0;
  for (const page of pages) {
    const text = normalizeWhitespace(page.text);
    if (!text) continue;

    let start = 0;
    while (start < text.length) {
      const end = chooseChunkEnd(text, start, maxSize);
      const value = text.slice(start, end).trim();
      if (value) chunks.push({ index: index++, page: page.page, text: value });
      if (end >= text.length) break;
      start = Math.max(start + 1, end - overlap);
      while (start < end && /\s/.test(text[start] ?? '')) start += 1;
    }
  }
  return chunks;
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchTerms(value: string): string[] {
  return [...new Set(
    normalizeForSearch(value)
      .split(/\s+/)
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
  )].slice(0, 30);
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) break;
    count += 1;
    from = found + needle.length;
  }
  return count;
}

/** Ranking deterministico usato dopo l'espansione delle parole chiave via LLM. */
export function rankDocumentChunks(
  chunks: SearchableDocumentChunk[],
  query: string,
  expandedTerms = '',
  limit = 8,
): RankedDocumentChunk[] {
  const primaryTerms = searchTerms(query);
  const terms = [...new Set([...primaryTerms, ...searchTerms(expandedTerms)])];
  if (terms.length === 0) return [];

  return chunks
    .map((chunk) => {
      const content = normalizeForSearch(chunk.text);
      const title = normalizeForSearch(`${chunk.documentTitle} ${chunk.categoryName}`);
      let matches = 0;
      let frequency = 0;
      let titleMatches = 0;
      for (const term of terms) {
        const count = occurrences(content, term);
        if (count > 0) matches += 1;
        frequency += Math.min(count, 5);
        if (title.includes(term)) titleMatches += 1;
      }
      const primaryCoverage = primaryTerms.filter((term) => content.includes(term)).length;
      const score = matches * 5 + frequency + titleMatches * 2 + primaryCoverage * 3;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.documentId - b.documentId || a.index - b.index)
    .slice(0, Math.max(1, limit));
}
