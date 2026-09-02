/**
 * Descrizione dello schema DB iniettata nel prompt di sistema dell'LLM.
 * Da aggiornare manualmente quando si aggiungono colonne/tabelle rilevanti
 * per le query in linguaggio naturale.
 */
export const SCHEMA_DESCRIPTION = `Schema PostgreSQL del gestionale Aplo's (laboratorio odontotecnico):

TABELLE:

operatori(id, nome, ruolo, deleted_at, created_at, updated_at)
  ruolo: 'admin' | 'tecnico'
  ATTENZIONE: \`nome\` è un campo unico (es. "Mario Rossi"). NON esiste
  \`cognome\` come colonna separata.

dottori(id, nome, studio, telefono, email, indirizzo, partita_iva, codice_fiscale, note, deleted_at, created_at, updated_at)
  ATTENZIONE: \`nome\` è un campo unico contenente il nome completo
  (es. "Dott. Mario Rossi", "Dott.ssa Giulia Romano"). NON esiste
  \`cognome\` come colonna separata. Per cercare un dottore per nome
  e cognome, usa \`nome ILIKE '%Mario Rossi%'\` su tutta la stringa,
  NON \`nome ILIKE '%Mario%' AND cognome ILIKE '%Rossi%'\`.

lavori(id, id_dottore, nome_paziente, data_entrata, data_consegna, stato, scala_colori, tipologia_lavoro, note_istruzioni, id_operatore_creazione, deleted_at, created_at, updated_at)
  stato: 'in_attesa' | 'in_corso' | 'in_prova' | 'finito'
  id_dottore -> dottori(id)

collaboratori(id, nome, telefono, email, mansioni, note, deleted_at, created_at, updated_at)
lavori_assegnazioni(id, id_lavoro, id_collaboratore, mansione, assegnato_at, rimosso_at, id_operatore_assegnazione, id_operatore_rimozione)
  id_lavoro -> lavori(id); id_collaboratore -> collaboratori(id)

macchinari(id, nome, marca, modello, matricola, ubicazione, note, deleted_at, created_at, updated_at)
manutenzioni_programmate(id, id_macchinario, titolo, descrizione, prossima_scadenza, preavviso_giorni, ricorrenza_valore, ricorrenza_unita, attiva, deleted_at)
manutenzioni_interventi(id, id_manutenzione, scadenza_prevista, completata_at, note, id_operatore)
  id_macchinario -> macchinari(id); id_manutenzione -> manutenzioni_programmate(id)

lavori_strutture(id, id_lavoro, tipo_struttura, elementi_dentali)
  tipo_struttura: 'corona_singola' | 'ponte'
  elementi_dentali: SMALLINT[]  -- numeri denti FDI 11..48 (permanenti) e 51..85 (decidui)
  id_lavoro -> lavori(id)

materiali(id, categoria, sottotipo, marca, colore, lotto, deposito_legacy, id_deposito, altezza_mm, larghezza_mm, quantita, quantita_parziale, unita_misura, stato_utilizzo, soglia_alert, deleted_at, created_at, updated_at)
  categoria: 'zirconio' | 'pmma' | 'resina' | 'metallo' | 'ceramica' | 'altro'
  stato_utilizzo: 'nuovo' | 'parziale' | 'esaurito'
  quantita: disponibilita nuova/non aperta
  quantita_parziale: disponibilita gia aperta e riutilizzabile

lavori_materiali(id, id_lavoro, id_materiale, quantita_usata, unita_misura, note, id_operatore, stato_prelievo, created_at)
  Tracciabilità MDR: registra quale lotto è stato usato su quale lavoro.

lavori_allegati(id, id_lavoro, nome_file, mime_type, size_bytes, created_at)
audit_log(id, id_operatore, azione, entita, id_entita, dettagli, created_at)

REGOLE DI INTERROGAZIONE:
- Soft delete (\`deleted_at IS NULL\`) ESISTE SOLO su: operatori, dottori,
  lavori, materiali, depositi, collaboratori, macchinari e manutenzioni_programmate.
- NON usare deleted_at su: lavori_strutture, lavori_allegati,
  lavori_materiali, lavori_assegnazioni, manutenzioni_interventi,
  audit_log (sono tabelle immutabili o di
  collegamento, non hanno la colonna).
- Per "in giacenza" dei materiali: \`stato_utilizzo <> 'esaurito' AND deleted_at IS NULL\`.
- Per "lavori attivi": \`stato <> 'finito' AND l.deleted_at IS NULL\`.
- Le date sono di tipo DATE; per "oggi" usa \`CURRENT_DATE\`.
- I nomi dei colori (es. A2) sono salvati come testo nel campo \`colore\`.
- Il colore del lavoro è \`scala_colori\` e usa la scala VITA: BL1-BL3,
  A1-A4 (incluso A3.5), B1-B4, C1-C4, D2-D4; D1 non esiste.
- Per cercare "lavori che usano materiale X" fai JOIN
  lavori → lavori_materiali → materiali, filtrando solo su
  \`materiali.categoria\`/\`materiali.colore\`/\`materiali.lotto\` e
  \`lavori.deleted_at IS NULL\` (NON su lavori_materiali).
`;
