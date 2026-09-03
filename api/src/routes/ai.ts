import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

import { config } from '../config.js';
import { readonlyPool } from '../db/readonly-pool.js';
import { logAudit } from '../audit.js';
import { requireAuth } from '../auth/guards.js';
import { SCHEMA_DESCRIPTION } from '../ai/schema-description.js';
import { extractAndValidateSql, rewriteAggregateOnlyToList } from '../ai/sql-guard.js';
import { llmChat, llmChatStream, llmHealth } from '../ai/llm.js';
import { quickClassify } from '../ai/classify.js';

const ChatBody = Type.Object({
  domanda: Type.String({ minLength: 1, maxLength: 1000 }),
});

const SQL_SYSTEM_PROMPT = `Sei un assistente che traduce domande in italiano o inglese in query SQL PostgreSQL.
${SCHEMA_DESCRIPTION}

RISPONDI SOLO con la query SQL, senza spiegazioni e senza testo aggiuntivo.
Usa SOLO statement SELECT. Non scrivere mai INSERT, UPDATE, DELETE, DROP, CREATE, ALTER.

REGOLE FONDAMENTALI:
- Anche per domande tipo "quanti …", NON usare COUNT(*) da solo: l'utente vuole
  vedere anche QUALI sono. Restituisci sempre i campi principali della tabella
  e ordina in modo sensato. Il conteggio l'utente lo vede dal numero di righe.
- Per i lavori, includi sempre: id, nome_paziente, data_consegna, stato; e
  fai JOIN con dottori per mostrare dottore_nome.
- Per i materiali, includi: id, categoria, marca, colore, lotto, stato_utilizzo,
  quantita (nuova), quantita_parziale e unita_misura.
- Per i dottori, includi: id, nome, studio, telefono.
- Aggiungi sempre \`LIMIT 100\` (o meno) se non specificato.
- Filtra sempre \`deleted_at IS NULL\` quando ha senso.
- Ordina in modo utile: lavori per data_consegna ASC, materiali per categoria/lotto.

ESEMPI:

Domanda: "Quanti lavori sono in corso?"
\`\`\`sql
SELECT l.id, l.nome_paziente, l.data_consegna, l.stato, d.nome AS dottore_nome
FROM lavori l JOIN dottori d ON d.id = l.id_dottore
WHERE l.stato IN ('in_corso_cad', 'in_corso_rifinitura')
  AND l.deleted_at IS NULL AND l.archiviato_at IS NULL
ORDER BY l.data_consegna ASC LIMIT 100
\`\`\`

Domanda: "Quali materiali sono sotto soglia?"
\`\`\`sql
SELECT id, categoria, marca, colore, lotto, quantita, quantita_parziale, unita_misura, soglia_alert
FROM materiali
WHERE deleted_at IS NULL AND soglia_alert IS NOT NULL
  AND COALESCE(quantita, 0) + COALESCE(quantita_parziale, 0) <= soglia_alert
ORDER BY categoria, lotto LIMIT 100
\`\`\`

Domanda: "Lavori in scadenza nei prossimi 5 giorni"
\`\`\`sql
SELECT l.id, l.nome_paziente, l.data_consegna, l.stato, d.nome AS dottore_nome
FROM lavori l JOIN dottori d ON d.id = l.id_dottore
WHERE l.deleted_at IS NULL AND l.stato <> 'finito'
  AND l.data_consegna BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
ORDER BY l.data_consegna ASC LIMIT 100
\`\`\`

Restituisci la query in un blocco \`\`\`sql ... \`\`\`.`;

const ANSWER_SYSTEM_PROMPT = `Sei un assistente per un laboratorio odontotecnico.
Riceverai una domanda dell'operatore con il risultato già pronto di una query
sul database aziendale.

REGOLE DI RISPOSTA — VINCOLANTI:
- Rispondi nella lingua richiesta nelle istruzioni finali, usando linguaggio naturale.
- NON generare SQL, NON usare blocchi di codice, NON menzionare la query.
- Sii conciso (1-3 frasi al massimo).
- Se il risultato è un conteggio, esprimilo chiaramente
  (es. "Ci sono 3 blocchi di zirconio A3 disponibili.").
- Se è una lista, riassumi i primi elementi in modo leggibile.
- Se la lista è vuota, dillo esplicitamente
  (es. "Nessun materiale risulta esaurito.").`;

const CLASSIFIER_PROMPT = `Sei un classificatore. L'utente fa una domanda
all'assistente di un gestionale per laboratorio odontotecnico.

Rispondi SOLO con una parola: DATI o INFO.

DATI = la domanda richiede di leggere dati specifici dal database, anche se
formulata con "Come …" o "Qual è …". Tutto ciò che riguarda un'entità
specifica (un dottore con nome, un materiale con lotto, un lavoro di un
paziente) è DATI.

INFO = la domanda riguarda il significato di un termine, come usare il
software in generale, o concetti di dominio. NON ci sono nomi di persone,
lotti, ID o filtri specifici.

In dubbio → DATI.`;

const CLASSIFIER_FEW_SHOT: Array<{ role: 'user' | 'assistant'; content: string }> = [
  { role: 'user', content: 'Come si crea un nuovo dottore?' },
  { role: 'assistant', content: 'INFO' },
  { role: 'user', content: 'Cosa significa stato in_prova?' },
  { role: 'assistant', content: 'INFO' },
  { role: 'user', content: 'Cos\'è la notazione FDI?' },
  { role: 'assistant', content: 'INFO' },
  { role: 'user', content: 'A cosa serve il PIN?' },
  { role: 'assistant', content: 'INFO' },
  // Domande con nomi specifici → DATI (anche se iniziano con "Come" / "Qual è")
  { role: 'user', content: 'Come posso contattare la dottoressa Verdi?' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'Qual è la mail del dottor Rossi?' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'Dammi il telefono di Giulia Romano' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'Mostrami i lavori in ritardo' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'Quante cialde di zirconio A2 abbiamo?' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'Quanti lavori ci sono?' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'How do I create a new doctor?' },
  { role: 'assistant', content: 'INFO' },
  { role: 'user', content: 'Show me jobs due this week' },
  { role: 'assistant', content: 'DATI' },
  { role: 'user', content: 'What is the phone number of Dr Smith?' },
  { role: 'assistant', content: 'DATI' },
];

const INFO_SYSTEM_PROMPT = `Sei "Aplo's buddy", l'assistente conversazionale del
gestionale Aplo's per laboratori odontotecnici. Rispondi in italiano in modo
conciso, professionale e amichevole.

COSA FA APLO'S:
- Tracciare i lavori (commesse) dal ricevimento alla consegna.
- Gestire il magazzino dei materiali con tracciabilità lotto → paziente,
  obbligatoria per la normativa MDR (Medical Device Regulation UE).
- Anagrafica dottori, operatori, depositi.
- Allegati STL e altri file per ogni lavoro.
- Stampa scheda lavoro in A4, export CSV di tutte le tabelle.
- Modulo AI integrato (questo) per interrogare i dati in linguaggio naturale.
- Libreria Documenti per organizzare PDF in categorie e chiedere all'AI
  risposte basate su protocolli, manuali e procedure caricati dal laboratorio.

CONCETTI CHIAVE:
- Stati di un lavoro: in_attesa, in_corso_cad, attesa_rifinitura,
  in_corso_rifinitura, in_prova (presso il dentista per prova su paziente —
  il lavoro è fisicamente fuori dal laboratorio), finito.
- Un lavoro può avere più collaboratori. Ogni incarico indica la fase CAD,
  rifinitura o altro e resta associato come attivo o completato.
- Categorie materiali: zirconio, pmma, resina, metallo, ceramica, altro.
  Per zirconio e pmma il formato standard è la "cialda" (disco da fresare).
- Stati materiale: nuovo, parziale (ne è già stato usato un pezzo, ma è
  riutilizzabile), esaurito.
- Numerazione FDI: 11-18, 21-28, 31-38, 41-48 per i denti permanenti
  (decine = quadrante, unità = posizione dal centro); 51-85 per i decidui.
- Strutture odontogramma: corona_singola (1 dente) oppure ponte (2+ denti
  uniti come unica struttura).
- Audit log: ogni azione "scrivente" è registrata con operatore + timestamp,
  vincolo MDR.
- Soft delete: i record con deleted_at non sono fisicamente cancellati,
  vincolo MDR.

COME OPERARE:
- Per cercare lavori, dottori, materiali → usa le pagine corrispondenti
  dalla sidebar, oppure chiedimi qui dati specifici (es. "lavori in scadenza
  questa settimana").
- Per stampare la scheda di un lavoro → apri il dettaglio, click su "Stampa".
  Dal dialog di stampa puoi anche salvare come PDF.
- Per esportare in CSV → bottone in alto a destra in ogni pagina lista.
- Per consultare un protocollo → apri Documenti, scegli una categoria o un PDF
  e usa il riquadro "Chiedi ai documenti". La risposta indica documento e pagina.
- Auto-logout dopo inattività (default 30 min) per sicurezza dei terminali
  condivisi.

Se l'utente ti chiede dati specifici dal database (es. "quanti X", "mostra Y"),
suggerisci di riformulare la domanda in modo che possa eseguire una ricerca.`;

function languageInstruction(english: boolean): string {
  return english
    ? 'IMPORTANT: Reply only in English. The user interface and the operator preference are English.'
    : 'IMPORTANTE: Rispondi esclusivamente in italiano. La preferenza dell’operatore è italiano.';
}

function localized(english: boolean, italian: string, englishText: string): string {
  return english ? englishText : italian;
}

const RESULT_ROW_LIMIT = 100;

/**
 * Heuristica per capire se l'LLM ha sbagliato strada e ha generato altro
 * SQL/codice invece di una frase in italiano. In quel caso scartiamo la
 * risposta e produciamo noi un riassunto deterministico.
 */
function looksLikeCodeOnly(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.startsWith('```')) return true;
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(t)) return true;
  // se è in maggioranza caratteri "tecnici" (parentesi, virgolette singole, ecc.)
  const codeLike = (t.match(/[`;{}()=]/g) || []).length;
  return codeLike > t.length * 0.15;
}

function deterministicSummary(rows: Record<string, unknown>[], totalRows: number, english: boolean): string {
  if (totalRows === 0) return localized(english, 'Nessun risultato.', 'No results.');
  // count(*) o aggregato singolo: SELECT COUNT(*) ritorna [{count: '3'}]
  if (rows.length === 1) {
    const only = rows[0]!;
    const keys = Object.keys(only);
    if (keys.length === 1) {
      const v = only[keys[0]!];
      if (typeof v === 'number' || typeof v === 'string') {
        return localized(english, `Risultato: ${v}.`, `Result: ${v}.`);
      }
    }
  }
  const sample = rows.slice(0, 5).map((r, i) => `${i + 1}. ${JSON.stringify(r)}`).join('\n');
  const more = totalRows > rows.length
    ? localized(english, `\n…e altre ${totalRows - rows.length} righe.`, `\n…and ${totalRows - rows.length} more rows.`)
    : '';
  return localized(english, `Trovate ${totalRows} righe:\n${sample}${more}`, `Found ${totalRows} rows:\n${sample}${more}`);
}

export async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/health', async (_req, reply) => {
    try {
      const h = await llmHealth();
      if (h.error) return reply.code(503).send({ status: 'error', ...h });
      return {
        status: h.ready ? 'ok' : 'model_not_installed',
        provider: h.provider,
        model: h.model,
        installed: h.installed,
      };
    } catch (err) {
      return reply.code(503).send({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  });

  app.post('/chat', { schema: { body: ChatBody } }, async (req, reply) => {
    const { domanda } = req.body as { domanda: string };
    const english = req.user?.lingua === 'en';

    // Streaming NDJSON: il client legge il body in chunk e mostra
    // progressivamente fasi, query, dati e risposta finale.
    // NB: con reply.hijack() saltiamo gli hook Fastify, incluso quello che
    // inietta gli header CORS — quindi li scriviamo a mano qui.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      // Disabilita il buffering quando dietro a nginx in produzione.
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': config.webOrigin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    });
    const send = (event: Record<string, unknown>): void => {
      reply.raw.write(JSON.stringify(event) + '\n');
    };
    const finish = (): void => {
      reply.raw.end();
    };

    // STEP 0: classificazione DATI vs INFO.
    // Prima euristica (no LLM): se la domanda è chiaramente DATI o INFO
    // saltiamo del tutto la chiamata classificatore — risparmiamo ~1/3
    // della latenza totale nel caso comune.
    let kind: 'sql' | 'info' = 'sql';
    const quick = quickClassify(domanda);
    if (quick !== null) {
      kind = quick;
    } else {
      send({ type: 'phase', phase: 'classifying' });
      try {
        const cls = await llmChat(
          [
            { role: 'system', content: CLASSIFIER_PROMPT },
            ...CLASSIFIER_FEW_SHOT,
            { role: 'user', content: domanda },
          ],
          { numPredict: 4 },
        );
        kind = /\bINFO\b/i.test(cls) && !/\bDATI\b/i.test(cls) ? 'info' : 'sql';
      } catch (err) {
        req.log.warn({ err }, 'classifier failed, fallback to sql');
      }
    }

    if (kind === 'info') {
      send({ type: 'phase', phase: 'answering' });
      let buffer = '';
      try {
        for await (const chunk of llmChatStream([
          { role: 'system', content: `${INFO_SYSTEM_PROMPT}\n\n${languageInstruction(english)}` },
          { role: 'user', content: domanda },
        ])) {
          buffer += chunk;
          send({ type: 'token', text: chunk });
        }
      } catch (err) {
        req.log.error({ err }, 'LLM irraggiungibile (info)');
        send({ type: 'error', error: localized(english, 'Assistente AI non disponibile', 'AI assistant unavailable') });
        finish();
        return reply;
      }
      await logAudit(req.pool, {
        idOperatore: req.user!.id,
        azione: 'AI_INFO',
        dettagli: { domanda },
      });
      send({
        type: 'done',
        tipo: 'info',
        risposta: buffer.trim(),
        sql: null,
        righe: 0,
        dati: [],
      });
      finish();
      return reply;
    }

    // Few-shot: gli esempi nel prompt non bastano per qwen-coder, che ha un
    // bias forte verso COUNT(*) per le domande "quanti …". Mostriamo turni
    // utente/assistente espliciti per fissare il formato atteso.
    const FEW_SHOT: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: 'Show me jobs due in the next 5 days',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT l.id, l.nome_paziente, l.data_consegna, l.stato, d.nome AS dottore_nome\n' +
          'FROM lavori l JOIN dottori d ON d.id = l.id_dottore\n' +
          "WHERE l.deleted_at IS NULL AND l.stato <> 'finito'\n" +
          "  AND l.data_consegna BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'\n" +
          'ORDER BY l.data_consegna ASC LIMIT 100\n```',
      },
      {
        role: 'user',
        content: 'Materials below threshold',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT id, categoria, marca, colore, lotto, quantita, quantita_parziale, unita_misura, soglia_alert\n' +
          'FROM materiali WHERE deleted_at IS NULL AND soglia_alert IS NOT NULL\n' +
          '  AND COALESCE(quantita, 0) + COALESCE(quantita_parziale, 0) <= soglia_alert\n' +
          'ORDER BY categoria, lotto LIMIT 100\n```',
      },
      {
        role: 'user',
        content: 'Quanti lavori sono in corso?',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT l.id, l.nome_paziente, l.data_consegna, l.stato, d.nome AS dottore_nome\n' +
          'FROM lavori l JOIN dottori d ON d.id = l.id_dottore\n' +
          "WHERE l.stato IN ('in_corso_cad', 'in_corso_rifinitura')\n" +
          "  AND l.deleted_at IS NULL AND l.archiviato_at IS NULL\n" +
          'ORDER BY l.data_consegna ASC LIMIT 100\n```',
      },
      {
        role: 'user',
        content: 'Quali materiali sono esauriti?',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT id, categoria, marca, colore, lotto, quantita, quantita_parziale, unita_misura\n' +
          "FROM materiali WHERE stato_utilizzo = 'esaurito' AND deleted_at IS NULL\n" +
          'ORDER BY categoria, lotto LIMIT 100\n```',
      },
      {
        role: 'user',
        content: 'Lavori del dottor Rossi',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT l.id, l.nome_paziente, l.data_consegna, l.stato, d.nome AS dottore_nome\n' +
          'FROM lavori l JOIN dottori d ON d.id = l.id_dottore\n' +
          "WHERE d.nome ILIKE '%Rossi%' AND l.deleted_at IS NULL\n" +
          'ORDER BY l.data_consegna DESC LIMIT 100\n```',
      },
      // Esempio cruciale: nome+cognome del dottore vanno su UNA SOLA colonna.
      // Senza questo esempio i modelli tendono a generare
      // `nome ILIKE '%X%' AND cognome ILIKE '%Y%'` che fallisce perché
      // `cognome` non esiste.
      {
        role: 'user',
        content: 'Contatti della dottoressa Giulia Romano',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT id, nome, studio, telefono, email, indirizzo\n' +
          "FROM dottori WHERE nome ILIKE '%Giulia Romano%' AND deleted_at IS NULL\n" +
          'LIMIT 100\n```',
      },
      {
        role: 'user',
        content: 'Quanti lavori abbiamo fatto questo mese, raggruppati per stato',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT stato, COUNT(*) AS totale\n' +
          'FROM lavori\n' +
          "WHERE deleted_at IS NULL AND data_entrata >= DATE_TRUNC('month', CURRENT_DATE)\n" +
          'GROUP BY stato ORDER BY totale DESC\n```',
      },
      {
        role: 'user',
        content: 'Materiali zirconio in giacenza',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT id, marca, colore, lotto, altezza_mm, larghezza_mm, stato_utilizzo\n' +
          "FROM materiali WHERE categoria = 'zirconio' AND stato_utilizzo <> 'esaurito'\n" +
          '  AND deleted_at IS NULL\n' +
          'ORDER BY marca, colore LIMIT 100\n```',
      },
      // Esempio di JOIN su lavori_materiali (tabella SENZA deleted_at)
      {
        role: 'user',
        content: 'Lavori che usano zirconio',
      },
      {
        role: 'assistant',
        content:
          '```sql\n' +
          'SELECT DISTINCT l.id, l.nome_paziente, l.data_consegna, l.stato,\n' +
          '       d.nome AS dottore_nome\n' +
          'FROM lavori l\n' +
          'JOIN dottori d ON d.id = l.id_dottore\n' +
          'JOIN lavori_materiali lm ON lm.id_lavoro = l.id\n' +
          'JOIN materiali m ON m.id = lm.id_materiale\n' +
          "WHERE m.categoria = 'zirconio' AND l.deleted_at IS NULL\n" +
          'ORDER BY l.data_consegna ASC LIMIT 100\n```',
      },
    ];

    send({ type: 'phase', phase: 'generating_sql' });
    let rawSql: string;
    try {
      rawSql = await llmChat([
        { role: 'system', content: SQL_SYSTEM_PROMPT },
        ...FEW_SHOT,
        { role: 'user', content: domanda },
      ]);
    } catch (err) {
      req.log.error({ err }, 'LLM irraggiungibile');
      send({ type: 'error', error: localized(english, 'Assistente AI non disponibile', 'AI assistant unavailable') });
      finish();
      return reply;
    }

    const guard = extractAndValidateSql(rawSql);
    if (!guard.ok || !guard.sql) {
      send({
        type: 'error',
        error: localized(
          english,
          `Query non valida: ${guard.reason ?? 'sconosciuto'}`,
          `Invalid query: ${guard.reason ?? 'unknown reason'}`,
        ),
        sql_raw: rawSql,
      });
      finish();
      return reply;
    }
    // Safety net: se nonostante few-shot il modello ha generato un COUNT da solo,
    // riscriviamo la query come SELECT * per mostrare anche le righe.
    guard.sql = rewriteAggregateOnlyToList(guard.sql);
    send({ type: 'sql', sql: guard.sql });

    // Se l'operatore è in modalità demo, dobbiamo leggere dal DB demo (req.pool).
    // In produzione preferiamo la pool read-only dedicata. In ogni caso la
    // query gira dentro `BEGIN READ ONLY` con timeout corto.
    const dataPool = req.user!.usa_demo ? req.pool : readonlyPool;

    /**
     * Esegue una query in transazione read-only con timeout corto.
     * Ritorna {rows, rowCount} o un oggetto error.
     */
    async function execReadOnly(sql: string): Promise<
      | { ok: true; rows: Record<string, unknown>[]; rowCount: number }
      | { ok: false; message: string }
    > {
      const c = await dataPool.connect();
      try {
        await c.query('BEGIN READ ONLY');
        await c.query("SET LOCAL statement_timeout = '5s'");
        const r = await c.query(sql);
        await c.query('COMMIT');
        return {
          ok: true,
          rows: (r.rows as Record<string, unknown>[]).slice(0, RESULT_ROW_LIMIT),
          rowCount: r.rowCount ?? r.rows.length,
        };
      } catch (err) {
        try { await c.query('ROLLBACK'); } catch {}
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      } finally {
        c.release();
      }
    }

    /**
     * Loop "agentic" leggero: se la prima query torna 0 righe, chiediamo al
     * modello di riformulare considerando interpretazioni alternative
     * (es. "X" come paziente invece che dottore, JOIN con altre entità).
     * Massimo 2 retry — al 3° tentativo restituiamo "nessun risultato".
     */
    const triedQueries: string[] = [];
    let resultRows: Record<string, unknown>[] = [];
    let resultRowCount = 0;
    let currentSql = guard.sql;
    const MAX_ATTEMPTS = 3;

    let lastSqlError: string | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt === 1) send({ type: 'phase', phase: 'executing' });
      else send({ type: 'phase', phase: 'retrying', attempt });
      triedQueries.push(currentSql);
      const r = await execReadOnly(currentSql);

      if (r.ok) {
        resultRows = r.rows;
        resultRowCount = r.rowCount;
        lastSqlError = null;
        if (resultRowCount > 0 || attempt === MAX_ATTEMPTS) break;
      } else {
        // Errore SQL (es. colonna inesistente): mostriamo l'errore al modello
        // e gli chiediamo di correggere. È più robusto del fallire subito,
        // soprattutto quando il modello inventa colonne (`cognome` su dottori
        // ecc.).
        req.log.warn({ err: r.message, sql: currentSql, attempt }, 'esecuzione SQL AI fallita');
        lastSqlError = r.message;
        if (attempt === MAX_ATTEMPTS) {
          send({
            type: 'error',
            error: localized(english, "Errore nell'esecuzione della query", 'Error while running the query'),
            details: r.message,
            sql: currentSql,
          });
          finish();
          return reply;
        }
      }

      // Costruiamo il messaggio di retry differenziato: errore SQL → fix
      // della query; 0 righe → riformulazione semantica alternativa.
      const retryUserMsg = lastSqlError
        ? 'La query precedente è stata rigettata da PostgreSQL con questo errore:\n' +
          `"${lastSqlError}"\n\n` +
          'Correggi la query. Ricordati che lo schema mostrato sopra è ' +
          'l\'unica fonte di verità: NON inventare colonne (es. nelle tabelle ' +
          'operatori e dottori non esiste "cognome", il nome completo è in ' +
          '"nome"). Genera SOLO la nuova query SQL.'
        : 'La query precedente non ha restituito risultati. ' +
          'Riformula con un\'interpretazione alternativa. ' +
          'Considera che un nome può riferirsi a entità diverse: ' +
          'paziente (lavori.nome_paziente), dottore (dottori.nome), ' +
          'materiale (lotto/marca), deposito (depositi.nome). ' +
          'Espressioni come "il dottore di X" o "i contatti di X" ' +
          'spesso significano "il dottore associato al paziente X" — ' +
          'in tal caso fai JOIN tra dottori e lavori filtrando per ' +
          'lavori.nome_paziente. Allarga ILIKE con %...%. ' +
          'Genera SOLO la nuova query SQL.';

      let retryRaw: string;
      try {
        retryRaw = await llmChat([
          { role: 'system', content: SQL_SYSTEM_PROMPT },
          ...FEW_SHOT,
          { role: 'user', content: domanda },
          { role: 'assistant', content: '```sql\n' + currentSql + '\n```' },
          { role: 'user', content: retryUserMsg },
        ]);
      } catch (err) {
        req.log.warn({ err }, 'retry LLM fallito');
        break;
      }
      const retryGuard = extractAndValidateSql(retryRaw);
      if (!retryGuard.ok || !retryGuard.sql) break;
      const next = rewriteAggregateOnlyToList(retryGuard.sql);
      if (triedQueries.includes(next)) break; // evita loop sulla stessa query
      currentSql = next;
    }

    // Aggiorna la sql "ufficiale" alla query che ha prodotto il risultato finale
    // (rilevante solo se è cambiata via retry; allora notifichiamo il client).
    if (currentSql !== guard.sql) send({ type: 'sql', sql: currentSql });
    guard.sql = currentSql;
    send({ type: 'data', rows: resultRows, rowCount: resultRowCount });

    send({ type: 'phase', phase: 'answering' });
    let answer = '';
    let streamingFailed = false;
    try {
      for await (const chunk of llmChatStream([
        { role: 'system', content: `${ANSWER_SYSTEM_PROMPT}\n\n${languageInstruction(english)}` },
        {
          role: 'user',
          content:
            `Domanda dell'operatore: ${domanda}\n\n` +
            `Risultato della query (${resultRowCount} righe totali, ` +
            `${resultRows.length} mostrate):\n` +
            JSON.stringify(resultRows, null, 2) +
            `\n\n${english ? 'Write the answer in English for the operator.' : "Formula la risposta in italiano per l'operatore."} ` +
            `${english ? 'Do not include SQL code.' : 'Non includere codice SQL.'}`,
        },
      ])) {
        answer += chunk;
        send({ type: 'token', text: chunk });
      }
    } catch (err) {
      req.log.error({ err }, 'LLM errore in fase di formulazione risposta');
      streamingFailed = true;
    }

    // Se il modello ha generato solo codice (caso raro nonostante system prompt)
    // o se lo streaming è fallito, sostituiamo con un riassunto deterministico.
    // Notifichiamo il client di rimpiazzare i token già visti con la versione
    // canonica (evento 'replace_answer').
    let finalAnswer = answer.trim();
    if (streamingFailed || looksLikeCodeOnly(answer)) {
      finalAnswer = deterministicSummary(resultRows, resultRowCount, english);
      send({ type: 'replace_answer', text: finalAnswer });
    }

    await logAudit(req.pool, {
      idOperatore: req.user!.id,
      azione: 'AI_QUERY',
      dettagli: { domanda, sql: guard.sql, n_righe: resultRowCount },
    });

    send({
      type: 'done',
      tipo: 'sql',
      sql: guard.sql,
      righe: resultRowCount,
      dati: resultRows,
      risposta: finalAnswer,
    });
    finish();
    return reply;
  });
}
