/**
 * Validazione "best-effort" che la stringa restituita dall'LLM sia una query
 * SELECT innocua. NON è una sandbox completa — la vera difesa è l'utente
 * read-only del DB. Questo è un secondo livello.
 */

const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'drop', 'create', 'alter',
  'truncate', 'grant', 'revoke', 'copy', 'execute', 'call',
  'do', 'vacuum', 'cluster', 'reindex', 'comment',
];

export interface SqlGuardResult {
  ok: boolean;
  sql?: string;
  reason?: string;
}

/**
 * Se la query è del tipo `SELECT COUNT(...) [AS name] FROM <rest>` senza
 * GROUP BY, la riscrive in `SELECT * FROM <rest>` con LIMIT 100. Altrimenti
 * ritorna la query originale.
 *
 * Motivazione: l'utente chiede "quanti X" ma vuole vedere anche QUALI sono.
 * Il count diventa implicito nel numero di righe ritornate. Se la query
 * contiene aggregazioni con GROUP BY, la lasciamo intatta (ha senso).
 */
export function rewriteAggregateOnlyToList(sql: string): string {
  if (/\bGROUP\s+BY\b/i.test(sql)) return sql;
  // SELECT COUNT(*) [AS x] FROM rest...
  const re = /^\s*SELECT\s+COUNT\s*\([^)]*\)\s*(?:AS\s+\w+\s*)?FROM\s+([\s\S]+?)\s*$/i;
  const m = re.exec(sql);
  if (!m) return sql;
  let rest = m[1]!.trim();
  // togli eventuali ORDER BY/LIMIT preesistenti se manca, comunque OK
  if (!/\bLIMIT\b/i.test(rest)) rest += ' LIMIT 100';
  return `SELECT * FROM ${rest}`;
}

export function extractAndValidateSql(raw: string): SqlGuardResult {
  // L'LLM può rispondere con ```sql ... ``` o testo libero. Estraiamo il
  // primo blocco di codice se presente, altrimenti prendiamo tutto.
  const codeFence = raw.match(/```(?:sql)?\s*([\s\S]+?)```/i);
  let sql = (codeFence?.[1] ?? raw).trim();

  // togli punteggiatura/commenti finali e ; multipli
  sql = sql.replace(/--.*$/gm, '').trim();
  // tieni solo la prima statement
  const firstSemicolon = sql.indexOf(';');
  if (firstSemicolon >= 0) sql = sql.slice(0, firstSemicolon).trim();

  if (sql.length === 0) {
    return { ok: false, reason: 'Risposta vuota dal modello' };
  }

  const lower = sql.toLowerCase();
  if (!lower.startsWith('select') && !lower.startsWith('with')) {
    return { ok: false, reason: 'La query non inizia con SELECT/WITH' };
  }

  // Word-boundary check sulle keyword vietate
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(lower)) {
      return { ok: false, reason: `Keyword non permessa: ${kw}` };
    }
  }

  return { ok: true, sql };
}
