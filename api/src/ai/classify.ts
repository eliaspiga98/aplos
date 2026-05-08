/**
 * Classificazione rapida DATI vs INFO senza chiamare l'LLM, quando
 * possibile. Riduce di un terzo la latenza nel caso comune.
 *
 * Strategia conservativa:
 *  - Se la domanda inizia o contiene segnali forti di "DATI" → DATI.
 *  - Se inizia con un verbo/forma chiaramente "INFO" (cosa, perché,
 *    spiegami…) → INFO.
 *  - Negli altri casi → null = "non sicuro, chiedi all'LLM".
 *
 * I pattern sono pensati per il dominio Aplo's (italiano).
 */

const DATI_VERB_PREFIXES = [
  'mostra', 'mostrami',
  'elenca', 'elencami',
  'dammi', 'dimmi',
  'trova', 'trovami', 'cerca', 'cercami',
  'lista', 'listami',
  'stampa',
  'visualizza',
  'esporta',
  'somma', 'sommami',
  'conta', 'contami',
  'quanti', 'quante',
  'quali', 'qual',
  'chi ', // "chi è il dottore di…"
];

// Sostantivi del dominio: se la domanda inizia direttamente con questi
// è quasi certamente una richiesta di dati (es. "lavori in scadenza").
const DATI_NOUN_PREFIXES = [
  'lavori', 'lavoro', 'commesse', 'commessa',
  'dottori', 'dottore', 'dottoressa',
  'materiali', 'materiale',
  'depositi', 'deposito',
  'operatori', 'operatore',
  'pazienti', 'paziente',
  'allegati', 'allegato',
  'cialde', 'cialda',
  'lotti', 'lotto',
];

const INFO_PREFIXES = [
  'cosa significa', 'cosa vuol dire', 'cosa indica',
  'cosa serve', 'a cosa serve', 'a che serve',
  'come si fa', 'come faccio', 'come si crea', 'come si modifica',
  'come si cancella', 'come si stampa', 'come funziona',
  'spiegami', 'spiega',
  'che cos\'è', 'cos\'è',
  'definizione di',
  'perché',
];

function startsWithAny(text: string, prefixes: string[]): boolean {
  return prefixes.some((p) => text.startsWith(p + ' ') || text === p);
}

/**
 * Ritorna 'sql' o 'info' se euristicamente sicuro, null altrimenti.
 * Il chiamante in caso di null deve fare il classifier LLM completo.
 */
export function quickClassify(domanda: string): 'sql' | 'info' | null {
  const t = domanda.trim().toLowerCase().replace(/[?!.]+$/g, '');
  if (t.length === 0) return null;

  // Domande informative — controllo prima per evitare collisioni con
  // "come si CREA un nuovo dottore" che inizia con "come" ma è INFO.
  if (startsWithAny(t, INFO_PREFIXES)) return 'info';

  if (startsWithAny(t, DATI_VERB_PREFIXES)) return 'sql';
  if (startsWithAny(t, DATI_NOUN_PREFIXES)) return 'sql';

  // Pattern "del/della/dei + nome proprio capitalizzato" → DATI
  // (es. "telefono del dottor Rossi", "lavori della dottoressa Verdi").
  // Lavoriamo sulla stringa originale (case sensitive) per il nome proprio.
  if (/\b(del|della|dei|delle|di)\s+(dottor|dottoressa|sig|signor|signora|paziente)\s+[A-ZÀ-Ú]/.test(domanda)) {
    return 'sql';
  }

  return null;
}
