Come Intelligenza Artificiale, devo essere onesto sulle mie capacità tecniche: non posso generare fisicamente un documento impaginato di 20 pagine in una singola risposta a causa dei limiti strutturali di lunghezza dell'output (limite di token). 

Tuttavia, posso fare la cosa più vicina e utile per il tuo scopo: fornirti un **Software Requirements Specification (SRS) estremamente dettagliato e denso di informazioni**. Questo documento espanderà ogni singolo concetto, spiegando non solo *cosa* fa il sistema, ma *perché* lo fa, *a cosa serve* a livello di business e *come* deve essere implementato a livello logico. Potrai prendere questo testo, incollarlo in Word o Google Docs, e costituirà l'ossatura completa e definitiva del tuo documento tecnico.

Ecco il documento di specifica esteso.

***

# Software Requirements Specification (SRS)
## Sistema Gestionale per Laboratori Odontotecnici "Aplo's"

---

## 1. Introduzione e Contesto di Business

### 1.1 Scopo del Documento
Il presente documento definisce le specifiche funzionali, non funzionali, logiche e di interfaccia per la creazione della versione di produzione del gestionale "Aplo's". È destinato al team di sviluppo (Frontend, Backend, Database Administrator), ai Project Manager e agli stakeholder aziendali.

### 1.2 Il Problema da Risolvere
I laboratori odontotecnici operano in un ambiente ad alta pressione, gestendo decine di commesse (lavori) contemporaneamente, provenienti da diversi studi medici. Ogni lavoro è un "dispositivo medico su misura" e richiede una rigida tracciabilità dei materiali utilizzati (per normative europee come la MDR - Medical Device Regulation), tempistiche di consegna precise e specifiche tecniche inequivocabili.
Il gestionale Aplo's nasce per digitalizzare e centralizzare questo flusso, eliminando la carta, riducendo gli errori di comunicazione e fornendo un controllo in tempo reale su produzione e magazzino.

### 1.3 Tipologie di Utente (Attori)
* **Operatore di Laboratorio (Odontotecnico):** Utente principale. Utilizza il sistema per registrare nuovi lavori, far avanzare lo stato di produzione e registrare i materiali consumati. Interagisce spesso con l'applicazione tramite tablet o PC condivisi, in ambienti polverosi (gesso, resina).
* **Amministratore / Titolare (Futuro):** Ha accesso a tutte le funzioni dell'operatore, più la gestione anagrafica degli studi medici, l'analisi finanziaria e la gestione degli accessi.

---

## 2. Architettura Generale e Scelte Tecniche (UX/UI)

### 2.1 Layout a Schermo Intero (SPA)
L'applicazione è progettata come una Single Page Application (SPA).
* **A cosa serve:** Garantisce una navigazione fluida senza ricaricamenti di pagina, fondamentale per un'operatività rapida in laboratorio.
* **Come funziona:** Un layout a due colonne (Sidebar fissa a sinistra, area di lavoro dinamica a destra). Questo pattern riduce il carico cognitivo dell'utente, che sa sempre dove trovare il menu principale.

---

## 3. Modulo 1: Autenticazione e Sicurezza (Login)

### 3.1 Descrizione e Obiettivo di Business
Il modulo di login protegge i dati sensibili dei pazienti e traccia la responsabilità delle azioni.

### 3.2 Logica di Accesso "Fast-Login" (User + PIN)
* **Perché non una classica email/password?** In un laboratorio, più tecnici usano lo stesso terminale vicino alle fresatrici o ai banchi di lavoro. Loggarsi ogni volta con email e password lunghe sarebbe un deterrente all'uso del software.
* **Come funziona:**
    1.  Il sistema mostra una lista o un dropdown degli operatori registrati.
    2.  L'utente seleziona il proprio nome.
    3.  Inserisce un PIN numerico breve (es. 4-6 cifre).
    4.  Il sistema verifica l'hash del PIN nel database.
* **Gestione Sessione:** Il sistema deve prevedere un auto-logout dopo X minuti di inattività per evitare che un operatore esegua azioni con il profilo di un collega che ha dimenticato di disconnettersi.

---

## 4. Modulo 2: Dashboard (Il Centro di Controllo)

### 4.1 Descrizione e Obiettivo di Business
La Dashboard è la prima schermata post-login. Serve a dare al titolare o al responsabile di laboratorio una "fotografia" istantanea del carico di lavoro e delle urgenze.

### 4.2 Componenti della Dashboard
* **KPI Widgets (Contatori):**
    * **Lavori Totali:** Indica il volume complessivo attualmente nel sistema.
    * **In Corso:** Evidenzia i colli di bottiglia in produzione.
    * **In Prova:** Lavori fisicamente fuori dal laboratorio (presso il dentista per prove su paziente). Serve a sapere cosa si è in attesa che rientri.
    * **Finiti:** Lavori pronti per la fatturazione o la spedizione.
    * **Materiali:** Avvisi rapidi (es. "3 materiali in esaurimento").
* **Tabella "Ultimi lavori registrati":**
    * **A cosa serve:** Offre un accesso rapido alle commesse appena inserite, permettendo all'operatore di riprendere un lavoro interrotto senza doverlo cercare nel database.

---

## 5. Modulo 3: Gestione Lavori (Il Commessario)

Questo è il cuore pulsante dell'applicazione. Qui si gestisce il ciclo di vita del dispositivo medico.

### 5.1 La Tabella Principale
* **Motore di Ricerca:** Deve essere di tipo "omni-search". L'operatore deve poter digitare il cognome del paziente, il nome del dottore o l'ID del lavoro in un unico campo, ottenendo risultati istantanei.
* **Perché:** Al telefono con uno studio medico, l'operatore deve rintracciare una commessa in pochi secondi.

### 5.2 Creazione e Modifica Commessa (Il Modale)
L'interfaccia di inserimento è una modale che raggruppa le specifiche tecniche in sezioni logiche.

#### A. Dati Anagrafici e Temporali
* **Dottore & Paziente:** Necessari per la fatturazione e la dichiarazione di conformità.
* **Date (Entrata e Consegna):**
    * **Logica:** La `Data Consegna` è critica. Il sistema deve permettere l'ordinamento dell'intera tabella lavori per "Data di Consegna più vicina" per gestire le priorità (Deadline management).
    * **Integrità della data civile:** il giorno scelto deve essere mostrato e
      salvato invariato in ogni vista, senza conversioni di fuso orario che lo
      anticipino o posticipino.

#### B. Dati Tecnici
* **Scala Colori (es. Scala VITA):**
    * **A cosa serve:** Determina l'estetica del dente finto (es. A1, A2, B3). Essenziale per la fase di ceramizzazione. Deve essere un menu a tendina standardizzato.
    * **Valori ammessi:** BL1, BL2, BL3, A1, A2, A3, A3.5, A4, B1, B2,
      B3, B4, C1, C2, C3, C4, D2, D3, D4. D1 non esiste e non deve essere
      selezionabile.
* **Tipologia Lavoro & Istruzioni:**
    * **A cosa serve:** Campi di testo libero per dettagli specifici richiesti dal medico (es. "Modellare la cuspide leggermente più piatta").
* **Allegati:**
    * **A cosa serve:** I laboratori moderni ricevono file STL (scansioni intraorali) anziché impronte in gesso. Questa sezione deve tracciare il nome del file associato o permetterne l'upload.

#### C. L'Odontogramma Interattivo (Core Feature)
* **Cosa fa:** Permette di selezionare su quali denti specifici (numerati secondo lo standard internazionale FDI 11-48) si sta effettuando il lavoro.
* **Logica dei Ponti (Raggruppamenti):**
    * In odontoiatria, una "corona" è un dente singolo. Un "ponte" è una struttura che unisce più denti (es. manca il dente 13, si crea un ponte tra 12 e 14).
    * **Interazione:** L'operatore clicca i denti (es. 12, 13, 14). Il sistema deve fornire un pulsante "Collega" o "Crea Ponte". Visivamente, i pulsanti devono apparire uniti.
    * **Struttura Dati:** Il database non deve salvare solo "Denti interessati: 12, 13, 14", ma deve distinguere se sono tre corone singole o un ponte unico. (Es. JSON: `{"tipo": "ponte", "elementi": [12,13,14]}`).

### 5.3 Collaboratori e assegnazione dei lavori

* I collaboratori sono le persone che eseguono fisicamente le lavorazioni e
  sono distinti dagli operatori autorizzati ad accedere al programma.
* Un lavoro può avere più collaboratori contemporaneamente, anche con mansioni
  differenti (per esempio CAD e rifinitura).
* Nel passaggio a `in_corso` il sistema propone l'assegnazione, senza renderla
  obbligatoria. Le assegnazioni possono essere aggiunte o modificate in seguito
  e non vengono rimosse automaticamente da un cambio di stato.
* Per ogni incarico devono restare disponibili collaboratore, mansione, data di
  assegnazione e data di eventuale rimozione.

### 5.4 Inserimento rapido del dottore

* Il form di creazione del lavoro permette di creare un nuovo dottore senza
  uscire dall'ordine e senza perdere i dati già compilati.
* Dopo il salvataggio, il nuovo dottore viene selezionato automaticamente.

---

## 6. Modulo 4: Gestione Materiali (Il Magazzino)

### 6.1 Scopo e Normativa (MDR)
La legge impone ai laboratori di sapere *esattamente* quale lotto di materiale (es. quale specifica cialda di zirconio) è stato usato per la bocca del paziente X. Questo modulo non è solo per il riordino scorte, ma è un obbligo legale.

### 6.2 Organizzazione per Categorie
* I materiali odontotecnici differiscono profondamente. L'interfaccia a Tab separa Zirconio, PMMA, Resine, Metalli (Cromo-Cobalto), ecc.
* **Perché:** Una cialda di Zirconio ha attributi come "Altezza (es. 20mm)" che determinano se un ponte grande può esservi fresato. Una resina liquida ha attributi di volume (es. ml o kg). I form di inserimento devono essere dinamici in base alla categoria.

### 6.3 Gestione della Cialda (Disco da Fresatura)
Le informazioni critiche da gestire per ogni disco (es. Zirconio):
* **Lotto & Marca:** Per la tracciabilità e i richiami in caso di materiale difettoso.
* **Altezza e Larghezza:** Per i software CAM.
* **Identità della scorta:** Due dischi con lo stesso lotto restano materiali
  distinti se differiscono per marca, colore, altezza o larghezza. La quantità
  può essere aggregata sulla stessa riga soltanto quando tutti questi dati,
  insieme a categoria e lotto, coincidono.
* **Stato della Scorta ("Riutilizzare"):** Un disco di zirconio costa molto. Viene inserito nella fresatrice, vi si ricava un dente, e poi viene rimesso in scatola perché ha ancora spazio utilizzabile. Il sistema deve supportare gli stati: *Nuovo*, *Riutilizzabile* (in uso parziale) ed *Esaurito*.

### 6.4 Macchinari e manutenzioni programmate

* Il sistema gestisce l'anagrafica dei macchinari del laboratorio con dati
  identificativi, ubicazione e note.
* Ogni macchinario può avere manutenzioni singole o ricorrenti per giorni, mesi
  o anni, con una data di scadenza e un numero configurabile di giorni di
  preavviso.
* L'utente riceve un popup in prossimità della scadenza e un nuovo popup nel
  giorno della scadenza. La lettura è memorizzata per singolo operatore.
* Il completamento di una manutenzione registra operatore, data, scadenza
  prevista e note. Se ricorrente, il sistema calcola la prima scadenza futura;
  altrimenti la programmazione viene chiusa.

---

## 7. Modulo 5: Assistente AI (Intelligenza Artificiale)

### 7.1 Obiettivo di Business
Ridurre il tempo speso per la ricerca di informazioni complesse. Invece di impostare 4 filtri manuali, l'operatore fa una domanda naturale.

### 7.2 Logica di Funzionamento (Text-to-SQL / RAG)
* **Cosa fa:** È un'interfaccia di chat che funge da "ponte" linguistico tra l'umano e il database del gestionale.
* **Flusso dei Dati:**
    1.  L'operatore digita: *"Quanti blocchi di Zirconio A3 abbiamo?"*
    2.  Il prompt viene inviato al backend.
    3.  Un modello LLM interpreta l'intento ed elabora una query sicura al database (es. `SELECT COUNT(*) FROM materiali WHERE categoria='Zirconio' AND colore='A3' AND stato != 'esaurito'`).
    4.  Il database restituisce il numero (es. 5).
    5.  Il LLM formula la risposta testuale: *"Attualmente ci sono 5 blocchi di Zirconio colore A3 disponibili."*
* **Sicurezza:** L'AI deve avere accesso in sola lettura (Read-Only) per prevenire cancellazioni o modifiche accidentali dei dati aziendali tramite prompt (No SQL Injection via AI).

### 7.3 Libreria Documenti e protocolli

* Gli operatori possono creare, rinominare ed eliminare categorie documentali
  libere, per esempio *Protocolli di lavoro*, *CAD*, *Ceramica* o *Sicurezza*.
* Ogni categoria può contenere PDF caricati nello storage locale del server.
  Titolo e categoria del documento possono essere modificati in seguito.
* Il testo selezionabile viene estratto e indicizzato per pagina senza inviare
  il file a servizi esterni. Un PDF composto solo da scansioni resta archiviato
  ma viene segnalato come non consultabile finché non sarà disponibile l'OCR.
* L'operatore può interrogare tutta la libreria, una categoria o un singolo
  documento. La risposta deve basarsi solo sugli estratti recuperati e mostrare
  le fonti con titolo del documento e numero di pagina.
* Creazione, modifica, eliminazione, reindicizzazione e domande documentali
  devono essere registrate nell'audit log.

---

## 8. Modello Dati e Struttura Database (Entity-Relationship)

Per supportare le funzionalità sopra descritte, il database relazionale (es. PostgreSQL) o NoSQL (es. MongoDB) dovrà essere strutturato con queste entità principali:

### 8.1 Tabella `Operatori`
* `id` (PK)
* `nome` (String)
* `ruolo` (Enum: Admin, Tecnico)
* `pin_hash` (String, criptata)

### 8.2 Tabella `Lavori` (Commesse)
* `id` (PK, Auto-increment)
* `id_dottore` (FK)
* `nome_paziente` (String)
* `data_entrata` (Date)
* `data_consegna` (Date)
* `stato` (Enum: In Attesa, In Corso, In Prova, Finito)
* `scala_colori` (String)
* `note_istruzioni` (Text)
* `id_operatore_creazione` (FK)
* `created_at` (Timestamp)
* `updated_at` (Timestamp)

### 8.3 Tabella `Lavori_Strutture` (Per l'Odontogramma)
* `id` (PK)
* `id_lavoro` (FK)
* `tipo_struttura` (Enum: Corona Singola, Ponte)
* `elementi_dentali` (Array di Interi, es. [12, 13, 14])

### 8.4 Tabella `Materiali`
* `id` (PK)
* `categoria` (Enum: Zirconio, PMMA, ecc.)
* `sottotipo` (String)
* `colore` (String)
* `lotto` (String, Unique)
* `deposito` (String - dove si trova fisicamente)
* `altezza_mm` (Int)
* `larghezza_mm` (Int)
* `marca` (String)
* `stato_utilizzo` (Enum: Nuovo, Parziale, Esaurito)

### 8.5 Tabella `Audit_Log` (Critica per normative)
* `id` (PK)
* `id_operatore` (FK)
* `azione` (String: es. "CAMBIO_STATO_LAVORO")
* `dettagli` (JSON: es. da "In Corso" a "Finito")
* `timestamp` (Datetime)

### 8.6 Tabelle della libreria documentale

* `Categorie_Documenti`: nome, descrizione, autore e soft delete.
* `Documenti`: categoria, titolo, nome file, percorso, hash, pagine e stato di
  indicizzazione.
* `Documenti_Chunk`: testo del PDF suddiviso per pagina e indice full-text.

---

## 9. Requisiti Non Funzionali

* **Responsività:** Sebbene pensato per desktop/tablet, il layout deve adattarsi fluidamente a schermi più piccoli, poiché in laboratorio gli spazi per i monitor possono essere ristretti.
* **Performance:** Il caricamento della tabella lavori e della dashboard deve avvenire in meno di 1.5 secondi per non frustrare l'operatività rapida.
* **Data Retention e Backup:** A causa delle normative sui dispositivi medici, i dati (specialmente le associazioni tra Lavoro e Lotto del materiale) non devono mai essere cancellati fisicamente (hard-delete). Deve essere implementato il "Soft Delete" (nascondere il dato tramite un flag `is_deleted = true`). Backup automatizzati giornalieri del database.
