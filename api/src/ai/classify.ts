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
  'show', 'show me', 'list', 'list all', 'find', 'search',
  'give me', 'tell me', 'display', 'export', 'print',
  'count', 'how many', 'which', 'who ',
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
  'jobs', 'job', 'orders', 'order', 'doctors', 'doctor',
  'materials', 'material', 'storage locations', 'operators', 'operator',
  'patients', 'patient', 'attachments', 'attachment', 'batches', 'batch',
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
  'what does', 'what is', 'what are', 'what do',
  'how do i', 'how to', 'how does', 'explain', 'definition of', 'why',
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

  if (startsWithAny(t, DATI_VERB_PREFIXES)) return 'sql';
  if (startsWithAny(t, DATI_NOUN_PREFIXES)) return 'sql';

  // Domande informative. I segnali DATI vengono controllati prima perché in
  // inglese forme come "which jobs" e "show me" sono inequivocabili.
  if (startsWithAny(t, INFO_PREFIXES)) {
    // "What is the phone/email of Dr Smith?" è una richiesta dati, non una
    // domanda enciclopedica nonostante il prefisso "what is".
    if (/^what (?:is|are)\s+(?:the\s+)?(?:phone|email|address|status|due date)\b/.test(t)) return 'sql';
    return 'info';
  }

  // Pattern "del/della/dei + nome proprio capitalizzato" → DATI
  // (es. "telefono del dottor Rossi", "lavori della dottoressa Verdi").
  // Lavoriamo sulla stringa originale (case sensitive) per il nome proprio.
  if (/\b(del|della|dei|delle|di)\s+(dottor|dottoressa|sig|signor|signora|paziente)\s+[A-ZÀ-Ú]/.test(domanda)) {
    return 'sql';
  }
  if (/\b(of|for)\s+(dr|doctor|patient|mr|mrs|ms)\.?\s+[A-Z]/.test(domanda)) return 'sql';

  return null;
}
