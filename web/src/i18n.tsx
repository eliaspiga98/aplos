import {
  createContext, useContext, useLayoutEffect, useMemo, type ReactNode,
} from 'react';
import { useAuth } from './auth';

export type Language = 'it' | 'en';

// Le chiavi italiane restano il testo sorgente dell'applicazione. Questo
// catalogo alimenta sia t() per i componenti nuovi sia il compat layer che
// localizza le schermate storiche mentre vengono migrate gradualmente.
const EN: Record<string, string> = {
  'Accedi per iniziare': 'Sign in to get started',
  'Operatore': 'Operator',
  'Operatori': 'Operators',
  'Nuovo operatore': 'New operator',
  'Modifica operatore': 'Edit operator',
  'Accesso…': 'Signing in…',
  'Accedi': 'Sign in',
  'Esci': 'Sign out',
  'Gestionale': 'Management system',
  'Dashboard': 'Dashboard',
  'Lavori': 'Jobs',
  'Lavoro': 'Job',
  'Nuovo lavoro': 'New job',
  'Crea lavoro': 'Create job',
  'Calendario': 'Calendar',
  'Calendario consegne': 'Delivery calendar',
  'Dottori': 'Doctors',
  'Dottore': 'Doctor',
  'Nuovo dottore': 'New doctor',
  'Collaboratori': 'Lab collaborators',
  'Collaboratore': 'Lab collaborator',
  'Nuovo collaboratore': 'New collaborator',
  'Modifica collaboratore': 'Edit collaborator',
  'Collaboratore creato': 'Collaborator created',
  'Collaboratore aggiornato': 'Collaborator updated',
  'Collaboratore archiviato': 'Collaborator archived',
  'Nessun collaboratore': 'No collaborators',
  'Nessun collaboratore assegnato.': 'No collaborator assigned.',
  'Collaboratori assegnati': 'Assigned collaborators',
  'Mansione': 'Task',
  'Mansioni': 'Tasks',
  'Mansioni abituali': 'Usual tasks',
  'Assegnato il': 'Assigned on',
  'Gestisci': 'Manage',
  'Salva assegnazioni': 'Save assignments',
  '+ Aggiungi collaboratore': '+ Add collaborator',
  '+ Nuovo dottore': '+ New doctor',
  'Macchinari': 'Machines',
  'Macchinario': 'Machine',
  'Nuovo macchinario': 'New machine',
  'Modifica macchinario': 'Edit machine',
  'Manutenzioni': 'Maintenance',
  'Manutenzioni programmate': 'Scheduled maintenance',
  'Programma manutenzione': 'Schedule maintenance',
  'Modifica manutenzione': 'Edit maintenance',
  'Prossima scadenza': 'Next due date',
  'Preavviso (giorni)': 'Advance warning (days)',
  'Manutenzione ricorrente': 'Recurring maintenance',
  'Programmazione attiva': 'Active schedule',
  'Completata': 'Complete',
  'Manutenzione completata': 'Maintenance completed',
  'Storico interventi': 'Maintenance history',
  'Nessun macchinario': 'No machines',
  'Nessuna manutenzione programmata.': 'No scheduled maintenance.',
  'Nessun intervento completato.': 'No completed maintenance.',
  'Manutenzioni da controllare': 'Maintenance to check',
  'Ho visto': 'Acknowledge',
  'Scala colori VITA': 'VITA shade guide',
  'Nessuno': 'None',
  'Materiali': 'Materials',
  'Materiale': 'Material',
  'Documenti': 'Documents',
  'Documento': 'Document',
  'Categorie': 'Categories',
  'Tutti i documenti': 'All documents',
  'Libreria completa': 'Complete library',
  'Carica PDF': 'Upload PDF',
  'Carica un PDF': 'Upload a PDF',
  'Carica il primo PDF': 'Upload the first PDF',
  'Carica e indicizza': 'Upload and index',
  'Indicizzazione…': 'Indexing…',
  'Nuova categoria': 'New category',
  'Nuova categoria documenti': 'New document category',
  'Modifica categoria': 'Edit category',
  'Crea categoria': 'Create category',
  'Nome categoria*': 'Category name*',
  'Chiedi ai documenti': 'Ask the documents',
  'Chiedi all’AI': 'Ask AI',
  'Chiedi su questo': 'Ask about this',
  'Analisi…': 'Analysing…',
  'Cerco nei documenti…': 'Searching documents…',
  'Ambito': 'Scope',
  'Tutti i documenti indicizzati': 'All indexed documents',
  'Usa tutta la categoria': 'Use the entire category',
  'Fonti consultate': 'Sources consulted',
  '1 pagina': '1 page',
  'Pronto per l’AI': 'Ready for AI',
  'Testo non disponibile': 'Text unavailable',
  'Apri PDF': 'Open PDF',
  'Reindicizza': 'Reindex',
  'Modifica documento': 'Edit document',
  'File originale': 'Original file',
  'File PDF*': 'PDF file*',
  'Nessun PDF in questo spazio': 'No PDFs in this space',
  'Protocolli, manuali e procedure consultabili dall’intelligenza artificiale.': 'Protocols, manuals and procedures that AI can consult.',
  'La risposta usa solo i passaggi trovati nei PDF e indica documento e pagina.': 'The answer only uses passages found in PDFs and identifies the document and page.',
  'Carica un protocollo con testo selezionabile per renderlo consultabile dall’AI.': 'Upload a protocol with selectable text to make it available to AI.',
  'Il documento non sarà più consultabile dall’intelligenza artificiale.': 'The document will no longer be available to AI.',
  'Il testo viene estratto sul server locale. I PDF composti solo da scansioni richiedono OCR e verranno segnalati.': 'Text is extracted on the local server. Scanned-only PDFs require OCR and will be flagged.',
  'Nuovo materiale': 'New material',
  'Materiali del lavoro': 'Job materials',
  'Materiali utilizzati': 'Materials used',
  'Aggiungi materiale': 'Add material',
  'Registra utilizzo': 'Record usage',
  'Depositi': 'Storage locations',
  'Deposito': 'Storage location',
  'Nuovo deposito': 'New storage location',
  'Nessun deposito': 'No storage locations',
  'Impostazioni': 'Settings',
  'Cambia PIN': 'Change PIN',
  'Modalità demo': 'Demo mode',
  'Stai operando sul DB di prova': 'You are using the demo database',
  'Amministratore': 'Administrator',
  'Tecnico': 'Technician',
  'Caricamento…': 'Loading…',
  'Pagina riservata agli amministratori.': 'This page is restricted to administrators.',
  'Nome': 'Name',
  'Ruolo': 'Role',
  'Lingua': 'Language',
  'Italiano': 'Italian',
  'Inglese': 'English',
  'Preferenze personali': 'Personal preferences',
  'La lingua viene applicata all’interfaccia e alle risposte di Aplo’s buddy.': "The language is applied to the interface and Aplo's buddy replies.",
  'Account demo': 'Demo account',
  'Creato': 'Created',
  'Nessun operatore': 'No operators',
  'Salva': 'Save',
  'Salva modifiche': 'Save changes',
  'Salva configurazione': 'Save configuration',
  'Salvataggio…': 'Saving…',
  'Annulla': 'Cancel',
  'Crea': 'Create',
  'Elimina': 'Delete',
  'Archivia': 'Archive',
  'Conferma': 'Confirm',
  'Chiudi': 'Close',
  'Scarica': 'Download',
  'Anteprima': 'Preview',
  'Errore': 'Error',
  'Errore di rete': 'Network error',
  'Errore di accesso': 'Sign-in error',
  'Errore di caricamento': 'Loading error',
  'Errore nel caricamento': 'Loading error',
  'Credenziali non valide': 'Invalid credentials',
  'Operatore non trovato': 'Operator not found',
  'Operatore eliminato': 'Operator deleted',
  'Dottore non trovato': 'Doctor not found',
  'Dottore eliminato': 'Doctor deleted',
  'Materiale non trovato': 'Material not found',
  'Impossibile eliminare il materiale': 'Unable to delete the material',
  'Il materiale sparirà dal magazzino, ma gli utilizzi già associati ai lavori resteranno nello storico.': 'The material will disappear from inventory, while existing job usage will remain in history.',
  'Deposito non trovato': 'Storage location not found',
  'Deposito eliminato': 'Storage location deleted',
  'Lavoro non trovato': 'Job not found',
  'Allegato non trovato': 'Attachment not found',
  'Allegato eliminato': 'Attachment deleted',
  'Nessun campo da aggiornare': 'No fields to update',
  'Non puoi cancellare te stesso': 'You cannot delete your own account',
  'Deve rimanere almeno un amministratore attivo': 'At least one active administrator must remain',
  'PIN attuale errato': 'Current PIN is incorrect',
  'Nessun file inviato': 'No file uploaded',
  'Seleziona un dottore': 'Select a doctor',
  'La data di consegna non può essere prima della data di entrata': 'The due date cannot be before the received date',
  'Una corona singola deve avere esattamente 1 dente': 'A single crown must contain exactly 1 tooth',
  'Un ponte deve avere almeno 2 denti': 'A bridge must contain at least 2 teeth',
  'Impossibile eliminare il deposito: contiene ancora materiali attivi.': 'The storage location cannot be deleted because it still contains active materials.',
  'Modello AI': 'AI model',
  'Provider': 'Provider',
  'Modello': 'Model',
  'Pronto': 'Ready',
  'Non pronto': 'Not ready',
  'Prova connessione': 'Test connection',
  'Test in corso…': 'Testing…',
  'Database e backup': 'Database and backups',
  'Database utilizzato': 'Database in use',
  'Server PostgreSQL': 'PostgreSQL server',
  'Percorso dati PostgreSQL': 'PostgreSQL data path',
  'Non disponibile con i permessi applicativi': 'Unavailable with application-level permissions',
  'Backup automatico': 'Automatic backup',
  'Disattivato': 'Disabled',
  'Ogni giorno': 'Every day',
  'Ogni settimana': 'Every week',
  'Numero massimo di backup conservati': 'Maximum backups to retain',
  'Cartella di salvataggio sul PC server': 'Backup folder on the server PC',
  'Percorso effettivo:': 'Resolved path:',
  'Backup in corso': 'Backup running',
  'Backup in corso…': 'Backing up…',
  'Esegui backup ora': 'Run backup now',
  'Backup completato.': 'Backup completed.',
  'Salva prima le modifiche.': 'Save the changes first.',
  'Ultimo backup:': 'Last backup:',
  'Ultimo errore:': 'Last error:',
  'Dimensione:': 'Size:',
  'mai eseguito': 'never run',
  'Configurazione backup salvata.': 'Backup configuration saved.',
  'Dati e percorsi': 'Data and paths',
  'Cartella configurazione': 'Configuration folder',
  'Cartella allegati': 'Attachments folder',
  'File di configurazione attivo': 'Active configuration file',
  'Il cambio della cartella di configurazione sarà completo al prossimo riavvio.': 'The configuration folder change will be complete after the next restart.',
  'Configurazione e allegati esistenti vengono copiati automaticamente prima del cambio.': 'Existing configuration and attachments are copied automatically before the change.',
  'Percorsi salvati.': 'Paths saved.',
  'Quando usare cosa': 'When to use each option',
  'Provider attivo:': 'Active provider:',
  'Le modifiche entrano in uso dal messaggio successivo della Chat.': 'Changes take effect from the next chat message.',
  'Connessione fallita': 'Connection failed',
  'Connessione OK': 'Connection OK',
  'Modelli noti al provider attivo:': 'Models available from the active provider:',
  'Stato': 'Status',
  'In attesa': 'Waiting',
  'in_attesa': 'waiting',
  'In corso': 'In progress',
  'in_corso': 'in progress',
  'In corso CAD': 'CAD in progress',
  'in_corso_cad': 'CAD in progress',
  'Attesa rifinitura': 'Waiting for finishing',
  'attesa_rifinitura': 'waiting for finishing',
  'In corso rifinitura': 'Finishing in progress',
  'in_corso_rifinitura': 'finishing in progress',
  'In prova': 'Try-in',
  'in_prova': 'try-in',
  'Finito': 'Finished',
  'finito': 'finished',
  'Finiti': 'Finished',
  'Nuovo': 'New',
  'Nuovi': 'New',
  'nuovo': 'new',
  'Parziale': 'Partially used',
  'Parziali': 'Partially used',
  'parziale': 'partially used',
  'Esaurito': 'Depleted',
  'esaurito': 'depleted',
  'Categoria': 'Category',
  'Marca': 'Brand',
  'Colore': 'Shade',
  'Lotto': 'Batch',
  'Quantità': 'Quantity',
  'Quantità nuova': 'New quantity',
  'Quantità nuova*': 'New quantity*',
  'Quantità parziale': 'Partially used quantity',
  'Quantità utilizzata*': 'Quantity used*',
  'Unità di misura': 'Unit of measure',
  'Misura': 'Size',
  'Disponibilità': 'Availability',
  'Azioni': 'Actions',
  'Materiale disponibile*': 'Available material*',
  'Deposito*': 'Storage location*',
  'Stato calcolato': 'Calculated status',
  'Prelievo': 'Stock type',
  'Già registrati': 'Already recorded',
  'Da aggiungere al salvataggio': 'To add when saving',
  'Rimuovi': 'Remove',
  'Storico': 'History',
  'Unità': 'Unit',
  'Soglia': 'Threshold',
  'Altezza (mm)': 'Height (mm)',
  'Larghezza (mm)': 'Width (mm)',
  'Dimensioni cialda': 'Disc dimensions',
  'Zirconio': 'Zirconia',
  'Resina': 'Resin',
  'Metallo': 'Metal',
  'Ceramica': 'Ceramic',
  'Altro': 'Other',
  'Paziente': 'Patient',
  'Studio': 'Practice',
  'Telefono': 'Phone',
  'Email': 'Email',
  'Indirizzo': 'Address',
  'Partita IVA': 'VAT number',
  'Codice fiscale': 'Tax code',
  'Note': 'Notes',
  'Tipologia': 'Type',
  'Data entrata': 'Received date',
  'Data consegna': 'Due date',
  'Entrata': 'Received',
  'Consegna': 'Due',
  'File': 'File',
  'Tipo': 'Type',
  'Dimensione': 'Size',
  'Descrizione': 'Description',
  'Dim. (mm) / Quantità': 'Size (mm) / Quantity',
  'Allegati': 'Attachments',
  'Nessun lavoro': 'No jobs',
  'Nessun lavoro attivo': 'No active jobs',
  'Nessun dottore': 'No doctors',
  'Nessun materiale': 'No materials',
  'Nessun allegato.': 'No attachments.',
  'Nessuna struttura registrata.': 'No structures recorded.',
  'Nessun materiale registrato.': 'No materials recorded.',
  'Nessun materiale registrato per questo lavoro.': 'No materials recorded for this job.',
  'Nessun evento registrato.': 'No events recorded.',
  'Nessun lavoro per questo dottore.': 'No jobs for this doctor.',
  'Nessuna scadenza imminente': 'No upcoming deadlines',
  'Cerca paziente, dottore o ID…': 'Search patient, doctor or ID…',
  'Cerca per nome o studio…': 'Search by name or practice…',
  'Cerca lotto, marca, colore…': 'Search batch, brand or shade…',
  'Cerca per nome o descrizione…': 'Search by name or description…',
  'Esporta CSV': 'Export CSV',
  'Mostra': 'Show',
  'Nascondi': 'Hide',
  'Registra consumo': 'Record usage',
  'Consumo materiale registrato': 'Material usage recorded',
  'Corona singola': 'Single crown',
  'Ponte': 'Bridge',
  'Clicca i denti su cui agire': 'Click the teeth to edit',
  'Click per selezionare': 'Click to select',
  'Click per rimuovere la struttura': 'Click to remove the structure',
  'Oggi': 'Today',
  'Domani': 'Tomorrow',
  'Settimana': 'Week',
  'Mese precedente': 'Previous month',
  'Mese successivo': 'Next month',
  'Indietro': 'Back',
  'Laboratorio odontotecnico': 'Dental laboratory',
  'Anagrafica': 'Details',
  'Dati tecnici': 'Technical data',
  'Scala colori': 'Shade guide',
  'Istruzioni': 'Instructions',
  'Marca / colore': 'Brand / shade',
  'Firma operatore': 'Operator signature',
  'Firma controllo qualità': 'Quality-control signature',
  'Tutti gli stati': 'All statuses',
  'Tutte le categorie': 'All categories',
  'Lun': 'Mon', 'Mar': 'Tue', 'Mer': 'Wed', 'Gio': 'Thu', 'Ven': 'Fri', 'Sab': 'Sat', 'Dom': 'Sun',
  'Gennaio': 'January', 'Febbraio': 'February', 'Marzo': 'March', 'Aprile': 'April',
  'Maggio': 'May', 'Giugno': 'June', 'Luglio': 'July', 'Agosto': 'August',
  'Settembre': 'September', 'Ottobre': 'October', 'Novembre': 'November', 'Dicembre': 'December',
  'Coda consegne': 'Delivery queue',
  'Lavori da seguire': 'Jobs to track',
  'Materiali sotto soglia': 'Materials below threshold',
  'Top dottori': 'Top doctors',
  'Magazzino': 'Inventory',
  'Distribuzione': 'Distribution',
  'Distribuzione lavori': 'Job distribution',
  'Lavori attivi': 'Active jobs',
  'Questa settimana': 'This week',
  'Finiti negli ultimi 7gg': 'Finished in the last 7 days',
  'Da consegnare nei prossimi 7gg': 'Due in the next 7 days',
  'Lavori in ritardo': 'Overdue jobs',
  'prossimi 5': 'next 5',
  'per volume': 'by volume',
  'totali': 'total',
  'Aggiungi widget alla dashboard': 'Add a widget to the dashboard',
  'Tutto sotto controllo': 'Everything is under control',
  'Modifica dashboard': 'Edit dashboard',
  'Ripristina layout default': 'Restore default layout',
  'Rimuovi widget': 'Remove widget',
  'Nuova scheda': 'New tab',
  'Chiudi scheda': 'Close tab',
  'Pulisci questa scheda': 'Clear this tab',
  'Pulisci': 'Clear',
  'Ridimensiona': 'Resize',
  'Invia': 'Send',
  'Chiedi qualcosa…': 'Ask something…',
  'Classifico la domanda…': 'Classifying the question…',
  'Genero la query…': 'Generating the query…',
  'Eseguo la query…': 'Running the query…',
  'Riformulo la query…': 'Reworking the query…',
  'Preparo la risposta…': 'Preparing the answer…',
  'pronto': 'ready',
  'modello mancante': 'model missing',
  'offline': 'offline',
  'in connessione': 'connecting',
  'Quanti lavori sono in corso?': 'How many jobs are in progress?',
  'Quali lavori sono in scadenza?': 'Which jobs are due soon?',
  'Lavori che usano zirconio': 'Jobs using zirconia',
  'Sono il tuo assistente. Puoi chiedermi dati specifici sul gestionale o domande generali sul software.': 'I am your assistant. You can ask me about specific management-system data or general questions about the software.',
  '(nessuna risposta testuale)': '(no text response)',
  'risultato': 'result',
  'risultati': 'results',
  'Apri dettaglio': 'Open details',
  'Chiudi assistente': 'Close assistant',
  'Apri assistente': 'Open assistant',
  'Il modello': 'The model',
  'non è installato.': 'is not installed.',
  'non raggiungibile.': 'is unreachable.',
  'Nuovo PIN': 'New PIN',
  'PIN attuale': 'Current PIN',
  'Conferma nuovo PIN': 'Confirm new PIN',
  'PIN aggiornato': 'PIN updated',
  'Il PIN deve avere almeno 4 cifre': 'The PIN must contain at least 4 digits',
  'Il nuovo PIN deve essere diverso da quello attuale': 'The new PIN must differ from the current PIN',
  'Il nuovo PIN e la conferma non coincidono': 'The new PIN and confirmation do not match',
  'Nuovo PIN (lasciare vuoto per non cambiare)': 'New PIN (leave blank to keep the current one)',
  'Non puoi eliminare l’account con cui hai effettuato l’accesso.': 'You cannot delete the account you are currently using.',
  'Questo operatore vedrà il database di prova, separato da quello di produzione. Utile per fornire una demo a un cliente senza esporre dati reali.': 'This operator will use the demo database, separate from production. Useful for demonstrations without exposing real data.',
  'Aggiorna': 'Refresh',
  'Caricamento modello…': 'Loading model…',
  'Trascina per ruotare · scroll per zoom · click destro per traslare': 'Drag to rotate · scroll to zoom · right-click to pan',
  'Modifica': 'Edit',
  'Quando': 'When',
  'Statistiche': 'Statistics',
  'Lavori totali': 'Total jobs',
  'In ritardo': 'Overdue',
  'Tempo medio richiesto': 'Average requested time',
  'Tempo medio (solo finiti)': 'Average time (finished only)',
  'gg': 'days',
  'Date': 'Dates',
  'Odontogramma': 'Dental chart',
  'Upload in corso…': 'Uploading…',
  'Identificazione': 'Identification',
  'Stato e alert': 'Status and alerts',
  '— seleziona —': '— select —',
  '— seleziona deposito —': '— select storage location —',
  '— seleziona materiale —': '— select material —',
  '— nessuno —': '— none —',
  'Nessun dottore. Crea prima un dottore.': 'No doctors. Create a doctor first.',
  'Crea prima un deposito dalla pagina dedicata.': 'Create a storage location from its page first.',
  'P.IVA': 'VAT no.',
  'C.F.': 'Tax ID',
  'Salva percorsi': 'Save paths',
};

const REVERSE = Object.fromEntries(Object.entries(EN).map(([it, en]) => [en, it]));

function translateCore(value: string, language: Language): string {
  if (language === 'en') return EN[value] ?? value;
  return REVERSE[value] ?? value;
}

export function translateText(value: string, language: Language): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;
  let translated = translateCore(core, language);
  if (language === 'en' && translated === core) {
    translated = translated
      .replace(/^Ciao, (.+) 👋$/, 'Hello, $1 👋')
      .replace(/^Ciao 👋$/, 'Hello 👋')
      .replace(/^(\d+) risposte non lette$/, '$1 unread replies')
      .replace(/^(\d+) nuove risposte$/, '$1 new replies')
      .replace(/^Massimo (\d+) schede$/, 'Maximum $1 tabs')
      .replace(/^Operatore "(.+)" aggiornato$/, 'Operator "$1" updated')
      .replace(/^Operatore "(.+)" creato$/, 'Operator "$1" created')
      .replace(/^Dottore "(.+)" aggiornato$/, 'Doctor "$1" updated')
      .replace(/^Dottore "(.+)" creato$/, 'Doctor "$1" created')
      .replace(/^Deposito "(.+)" aggiornato$/, 'Storage location "$1" updated')
      .replace(/^Deposito "(.+)" creato$/, 'Storage location "$1" created')
      .replace(/^Lavoro #(\d+) aggiornato$/, 'Job #$1 updated')
      .replace(/^Lavoro #(\d+) creato$/, 'Job #$1 created')
      .replace(/^Lavoro #(\d+) eliminato$/, 'Job #$1 deleted')
      .replace(/^Allegato "(.+)" caricato$/, 'Attachment "$1" uploaded')
      .replace(/^Materiale (.+) lotto (.+) creato$/, 'Material $1 batch $2 created')
      .replace(/^Materiale lotto (.+) aggiornato$/, 'Material batch $1 updated')
      .replace(/^Materiale lotto (.+) eliminato$/, 'Material batch $1 deleted')
      .replace(/^Eliminare il materiale del lotto (.+)$/, 'Delete material from batch $1')
      .replace(/^Categoria: (.+)$/, 'Category: $1')
      .replace(/^(\d+) PDF$/, '$1 PDFs')
      .replace(/^(\d+) pagine$/, '$1 pages')
      .replace(/^pagina (\d+)$/, 'page $1')
      .replace(/^Documento [“"](.+)[”"] indicizzato$/, 'Document “$1” indexed')
      .replace(/^Documento [“"](.+)[”"] aggiornato$/, 'Document “$1” updated')
      .replace(/^Documento [“"](.+)[”"] eliminato$/, 'Document “$1” deleted')
      .replace(/^Documento [“"](.+)[”"] reindicizzato$/, 'Document “$1” reindexed')
      .replace(/^Categoria [“"](.+)[”"] creata$/, 'Category “$1” created')
      .replace(/^Categoria [“"](.+)[”"] aggiornata$/, 'Category “$1” updated')
      .replace(/^Categoria [“"](.+)[”"] eliminata$/, 'Category “$1” deleted')
      .replace(/^Impossibile eliminare: il deposito contiene (\d+) materiali attivi\.$/, 'Cannot delete: the storage location contains $1 active materials.');
  }
  return leading + translated + trailing;
}

function shouldSkip(node: Node): boolean {
  const parent = node.parentElement;
  return !!parent?.closest('.chat-msg-text, .document-answer-text, script, style, code, pre');
}

function translateElementTree(root: ParentNode, language: Language): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!shouldSkip(node)) {
      const next = translateText(node.nodeValue ?? '', language);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
  const elements: Element[] = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const element of elements) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const current = element.getAttribute(attr);
      if (!current) continue;
      const next = translateText(current, language);
      if (next !== current) element.setAttribute(attr, next);
    }
  }
}

interface I18nContextValue {
  language: Language;
  locale: string;
  t: (italian: string, english?: string) => string;
  setLanguage: (language: Language) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, setLanguage: saveLanguage } = useAuth();
  const language: Language = user?.lingua === 'en' ? 'en' : 'it';

  useLayoutEffect(() => {
    document.documentElement.lang = language;
    translateElementTree(document.body, language);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          if (!shouldSkip(mutation.target)) {
            const current = mutation.target.nodeValue ?? '';
            const next = translateText(current, language);
            if (next !== current) mutation.target.nodeValue = next;
          }
        } else {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) translateElementTree(node as Element, language);
            else if (node.nodeType === Node.TEXT_NODE && !shouldSkip(node)) {
              node.nodeValue = translateText(node.nodeValue ?? '', language);
            }
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: language === 'en' ? 'en-GB' : 'it-IT',
    t: (italian, english) => language === 'en' ? (english ?? EN[italian] ?? italian) : italian,
    setLanguage: saveLanguage,
  }), [language, saveLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
