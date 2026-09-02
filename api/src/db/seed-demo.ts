/**
 * Seed del DB demo (DEMO_DATABASE_URL). Popola con dati realistici per
 * dimostrare l'app a un cliente:
 *   - 5 depositi
 *   - 6 dottori
 *   - 15 materiali (varie categorie e stati)
 *   - 2 operatori demo (Admin Demo / Cliente Demo)
 *   - 35 lavori distribuiti per stato e date
 *   - strutture, collaboratori assegnati, macchinari e manutenzioni
 *
 * Idempotente: prima TRUNCATE, poi INSERT.
 *
 * Eseguire DOPO `npm run migrate:demo`:
 *   npm run seed:demo
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DEMO_DATABASE_URL;
if (!url) {
  console.error('DEMO_DATABASE_URL mancante in env');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 3 });

const today = new Date();
function dateOffset(days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tsOffset(days: number, hour = 9, minute = 0): Date {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1. Drop FK verso operatori (in demo non vincoliamo: chi opera dal main
    //    DB ha id arbitrari che non esistono nel demo).
    await c.query(`
      ALTER TABLE lavori DROP CONSTRAINT IF EXISTS lavori_id_operatore_creazione_fkey;
      ALTER TABLE lavori_materiali DROP CONSTRAINT IF EXISTS lavori_materiali_id_operatore_fkey;
      ALTER TABLE lavori_allegati DROP CONSTRAINT IF EXISTS lavori_allegati_id_operatore_fkey;
      ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_id_operatore_fkey;
      ALTER TABLE lavori_assegnazioni DROP CONSTRAINT IF EXISTS lavori_assegnazioni_id_operatore_assegnazione_fkey;
      ALTER TABLE lavori_assegnazioni DROP CONSTRAINT IF EXISTS lavori_assegnazioni_id_operatore_rimozione_fkey;
      ALTER TABLE manutenzioni_interventi DROP CONSTRAINT IF EXISTS manutenzioni_interventi_id_operatore_fkey;
      ALTER TABLE manutenzioni_notifiche_lette DROP CONSTRAINT IF EXISTS manutenzioni_notifiche_lette_id_operatore_fkey;
    `);

    // 2. Truncate dati (lascia schema_migrations).
    await c.query(`
      TRUNCATE
        audit_log, lavori_allegati, lavori_materiali, lavori_strutture,
        manutenzioni_notifiche_lette, manutenzioni_interventi, manutenzioni_programmate,
        macchinari, lavori_assegnazioni, collaboratori,
        lavori, materiali, depositi, dottori, operatori
      RESTART IDENTITY CASCADE
    `);

    // 3. Operatori demo (autenticazione resta sul main, ma lasciamo qualche
    //    riga di anagrafica visibile da query AI).
    const pinHash = await bcrypt.hash('0000', 10);
    await c.query(
      `INSERT INTO operatori (nome, ruolo, pin_hash, usa_demo) VALUES
         ('Admin Demo', 'admin', $1, true),
         ('Tecnico Demo', 'tecnico', $1, true)`,
      [pinHash],
    );
    // TRUNCATE operatori ... CASCADE svuota anche il singleton collegato
    // app_settings: lo ricreiamo con i default correnti delle migrazioni.
    await c.query(`INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

    // 4. Depositi
    await c.query(`
      INSERT INTO depositi (nome, descrizione) VALUES
        ('Armadio Zirconio', 'Cialde di zirconio multilayer e monocromatiche'),
        ('Armadio PMMA',     'Provvisori e mascherine'),
        ('Banco Resine',     'Resine fotopolimerizzabili e self-cure'),
        ('Frigo Metalli',    'Leghe Cr-Co per scheletrati'),
        ('Scaffale Ceramiche','Impasti ceramici e pigmenti')
    `);

    // 5. Dottori (italiani realistici)
    await c.query(`
      INSERT INTO dottori (nome, studio, telefono, email, indirizzo, partita_iva) VALUES
        ('Dr. Marco Bianchi',      'Studio Bianchi',            '02-1234567',   'marco.bianchi@studiobianchi.it',  'Via Dante 12, Milano',     '01234567890'),
        ('Dr.ssa Laura Verdi',     'Centro Odontoiatrico Verdi','06-2345678',   'l.verdi@verdimedical.it',         'Via Veneto 45, Roma',      '12345678901'),
        ('Dr. Stefano Rossi',      'Studio Dentistico Rossi',   '011-3456789',  'rossi@dentalstudio.it',           'Corso Italia 78, Torino',  '23456789012'),
        ('Dr.ssa Giulia Romano',   'Romano Dental',             '081-4567890',  'g.romano@romanodental.it',        'Via Roma 33, Napoli',      '34567890123'),
        ('Dr. Luca Marini',        'Studio Marini',             '051-5678901',  'marini@marinismile.it',           'Via Indipendenza 56, Bologna','45678901234'),
        ('Dr. Paolo Conti',        'Conti Smile Center',        '055-6789012',  'p.conti@contismile.it',           'Piazza Duomo 8, Firenze',  '56789012345')
    `);

    await c.query(`
      INSERT INTO collaboratori (nome, telefono, email, mansioni, note) VALUES
        ('Elia Spiga',      '333-1000001', 'elia@laboratorio.demo',   'CAD, progettazione', 'Responsabile flusso digitale'),
        ('Marta Colombo',   '333-1000002', 'marta@laboratorio.demo',  'Rifinitura, lucidatura', NULL),
        ('Davide Ferri',    '333-1000003', 'davide@laboratorio.demo', 'Ceramica, stratificazione', NULL),
        ('Giulia Sartori',  '333-1000004', 'giulia@laboratorio.demo', 'Fresatura, controllo qualità', NULL)
    `);

    // 6. Materiali
    await c.query(`
      INSERT INTO materiali
        (categoria, sottotipo, marca, colore, lotto, id_deposito, altezza_mm, larghezza_mm,
         quantita, unita_misura, stato_utilizzo, soglia_alert) VALUES
        ('zirconio','multilayer',  'Aidite',     'A1',     'ZR-A1-2025-01', 1, 20, 98,   NULL, NULL, 'nuovo',     2),
        ('zirconio','multilayer',  'Aidite',     'A2',     'ZR-A2-2025-03', 1, 20, 98,   NULL, NULL, 'parziale',  2),
        ('zirconio','multilayer',  'Aidite',     'A3',     'ZR-A3-2025-02', 1, 20, 98,   NULL, NULL, 'nuovo',     2),
        ('zirconio','monolitico',  'Zirkonzahn', 'BL2',    'ZK-BL2-2025-01',1, 16, 98,   NULL, NULL, 'nuovo',     1),
        ('zirconio','multilayer',  'Vita',       'B1',     'VT-B1-2025-04', 1, 20, 98,   NULL, NULL, 'esaurito',  1),
        ('pmma',    'provvisorio', 'Yamahachi',  'A2',     'PM-A2-2025-07', 2, 16, 98,   NULL, NULL, 'nuovo',     2),
        ('pmma',    'mascherina',  'Yamahachi',  NULL,     'PM-CL-2025-08', 2, 25, 98,   NULL, NULL, 'parziale',  2),
        ('pmma',    'monolitico',  'Vipi',       'A3',     'PM-A3-2025-05', 2, 20, 98,   NULL, NULL, 'nuovo',     2),
        ('resina',  'autopolim.',  'GC',         NULL,     'RS-AC-2025-11', 3, NULL,NULL, 250, 'g',  'parziale',  100),
        ('resina',  'fotopolim.',  '3M',         'A2',     'RS-FT-2025-09', 3, NULL,NULL, 480, 'g',  'nuovo',     100),
        ('metallo', 'Cr-Co',       'Bego',       NULL,     'MT-CC-2025-02', 4, NULL,NULL, 1500,'g',  'nuovo',     500),
        ('metallo', 'Cr-Co',       'BeGo',       NULL,     'MT-CC-2025-04', 4, NULL,NULL,  300,'g',  'esaurito',  500),
        ('ceramica','impasto',     'Vita VM9',   'A2',     'CR-VM-2025-01', 5, NULL,NULL,  120,'g',  'parziale',  50),
        ('ceramica','impasto',     'Vita VM9',   'A3',     'CR-VM-2025-02', 5, NULL,NULL,   45,'g',  'parziale',  50),
        ('altro',   'isolante',    'Picodent',   NULL,     'AL-IS-2025-01', 5, NULL,NULL,  900,'ml', 'nuovo',     200)
    `);

    // 7. Lavori (25) — distribuiti per stato e date
    type LavoroSeed = {
      dottore: number; paziente: string; entrata: number; consegna: number;
      stato: string; colore: string; tipologia: string; istruzioni?: string;
      strutture: Array<{ tipo: 'corona_singola' | 'ponte'; denti: number[] }>;
    };
    const lavori: LavoroSeed[] = [
      // in_attesa (4)
      { dottore: 1, paziente: 'Anna Conti',       entrata: -1, consegna: 14, stato: 'in_attesa', colore: 'A2', tipologia: 'Ponte 3 elementi zirconio', istruzioni: 'Spalla cervicale 0.8mm', strutture: [{ tipo: 'ponte', denti: [11, 21, 22] }] },
      { dottore: 2, paziente: 'Giuseppe Russo',   entrata: -1, consegna: 12, stato: 'in_attesa', colore: 'A3', tipologia: 'Corona singola', strutture: [{ tipo: 'corona_singola', denti: [36] }] },
      { dottore: 3, paziente: 'Maria Esposito',   entrata: 0,  consegna: 18, stato: 'in_attesa', colore: 'B1', tipologia: 'Faccette 6 elementi', istruzioni: 'Estetica anteriori, alta lucidatura', strutture: [{ tipo: 'corona_singola', denti: [13] }, { tipo: 'corona_singola', denti: [12] }, { tipo: 'corona_singola', denti: [11] }, { tipo: 'corona_singola', denti: [21] }, { tipo: 'corona_singola', denti: [22] }, { tipo: 'corona_singola', denti: [23] }] },
      { dottore: 4, paziente: 'Andrea Ferrari',   entrata: 0,  consegna: 21, stato: 'in_attesa', colore: 'A3.5', tipologia: 'Provvisorio fresato PMMA', strutture: [{ tipo: 'ponte', denti: [14, 15, 16] }] },

      // in_corso (9)
      { dottore: 1, paziente: 'Carlo Greco',      entrata: -3, consegna: 5,  stato: 'in_corso',  colore: 'A2', tipologia: 'Corona zirconio',           strutture: [{ tipo: 'corona_singola', denti: [26] }] },
      { dottore: 2, paziente: 'Elena Marchetti',  entrata: -4, consegna: 8,  stato: 'in_corso',  colore: 'A3', tipologia: 'Ponte 4 elementi posteriore',istruzioni: 'Pontic ridge-lap', strutture: [{ tipo: 'ponte', denti: [44, 45, 46, 47] }] },
      { dottore: 3, paziente: 'Roberto Bruno',    entrata: -2, consegna: 6,  stato: 'in_corso',  colore: 'A1', tipologia: 'Corona singola anteriore',   strutture: [{ tipo: 'corona_singola', denti: [11] }] },
      { dottore: 5, paziente: 'Sara Gallo',       entrata: -5, consegna: 4,  stato: 'in_corso',  colore: 'B2', tipologia: 'Inlay disilicato',           strutture: [{ tipo: 'corona_singola', denti: [25] }] },
      { dottore: 1, paziente: 'Davide Costa',     entrata: -2, consegna: 9,  stato: 'in_corso',  colore: 'A2', tipologia: 'Ponte Maryland', istruzioni: 'Ali in metallo', strutture: [{ tipo: 'ponte', denti: [12, 11, 21] }] },
      { dottore: 4, paziente: 'Francesca Rinaldi',entrata: -3, consegna: 10, stato: 'in_corso',  colore: 'A3', tipologia: 'Corona zirconio singola',    strutture: [{ tipo: 'corona_singola', denti: [37] }] },
      { dottore: 6, paziente: 'Luigi Galli',      entrata: -6, consegna: 3,  stato: 'in_corso',  colore: 'A3.5', tipologia: 'Scheletrato Cr-Co',         strutture: [{ tipo: 'corona_singola', denti: [16] }, { tipo: 'corona_singola', denti: [26] }, { tipo: 'corona_singola', denti: [36] }, { tipo: 'corona_singola', denti: [46] }] },
      { dottore: 2, paziente: 'Paola Vitale',     entrata: -4, consegna: 7,  stato: 'in_corso',  colore: 'B1', tipologia: 'Faccetta singola',           strutture: [{ tipo: 'corona_singola', denti: [21] }] },
      { dottore: 5, paziente: 'Marco Riva',       entrata: -1, consegna: 11, stato: 'in_corso',  colore: 'A2', tipologia: 'Corona su impianto',         strutture: [{ tipo: 'corona_singola', denti: [36] }] },

      // in_prova (5) — fuori dal lab presso il dentista
      { dottore: 1, paziente: 'Beatrice Longo',   entrata: -8, consegna: 2,  stato: 'in_prova',  colore: 'A2', tipologia: 'Prova struttura ponte',      strutture: [{ tipo: 'ponte', denti: [13, 14, 15] }] },
      { dottore: 3, paziente: 'Tommaso Mazza',    entrata: -7, consegna: 1,  stato: 'in_prova',  colore: 'A3', tipologia: 'Prova biscotto corona',      strutture: [{ tipo: 'corona_singola', denti: [11] }] },
      { dottore: 4, paziente: 'Elisa Pellegrini', entrata: -10,consegna: 0,  stato: 'in_prova',  colore: 'B1', tipologia: 'Prova estetica faccette',istruzioni: 'Ricontrollo punto di contatto', strutture: [{ tipo: 'corona_singola', denti: [12] }, { tipo: 'corona_singola', denti: [11] }, { tipo: 'corona_singola', denti: [21] }, { tipo: 'corona_singola', denti: [22] }] },
      { dottore: 6, paziente: 'Stefano Lombardi', entrata: -6, consegna: -1, stato: 'in_prova',  colore: 'A2', tipologia: 'Prova metallo scheletrato',  strutture: [{ tipo: 'corona_singola', denti: [16] }, { tipo: 'corona_singola', denti: [26] }] },
      { dottore: 2, paziente: 'Silvia De Luca',   entrata: -9, consegna: 1,  stato: 'in_prova',  colore: 'A3.5', tipologia: 'Prova provvisorio PMMA',    strutture: [{ tipo: 'ponte', denti: [44, 45, 46] }] },

      // finito (7)
      { dottore: 1, paziente: 'Pietro Sala',      entrata: -20,consegna: -8, stato: 'finito',    colore: 'A2', tipologia: 'Corona zirconio',            strutture: [{ tipo: 'corona_singola', denti: [16] }] },
      { dottore: 5, paziente: 'Chiara Moretti',   entrata: -25,consegna: -10,stato: 'finito',    colore: 'A3', tipologia: 'Ponte 3 elementi',           strutture: [{ tipo: 'ponte', denti: [24, 25, 26] }] },
      { dottore: 3, paziente: 'Federico Caruso',  entrata: -18,consegna: -5, stato: 'finito',    colore: 'A1', tipologia: 'Faccetta',                   strutture: [{ tipo: 'corona_singola', denti: [21] }] },
      { dottore: 2, paziente: 'Martina Russo',    entrata: -22,consegna: -12,stato: 'finito',    colore: 'B2', tipologia: 'Corona disilicato',          strutture: [{ tipo: 'corona_singola', denti: [37] }] },
      { dottore: 4, paziente: 'Giorgio Neri',     entrata: -30,consegna: -15,stato: 'finito',    colore: 'A2', tipologia: 'Provvisorio PMMA',           strutture: [{ tipo: 'ponte', denti: [14, 15, 16, 17] }] },
      { dottore: 6, paziente: 'Valentina Bianchi',entrata: -28,consegna: -7, stato: 'finito',    colore: 'A3', tipologia: 'Scheletrato',                strutture: [{ tipo: 'corona_singola', denti: [13] }, { tipo: 'corona_singola', denti: [23] }, { tipo: 'corona_singola', denti: [33] }, { tipo: 'corona_singola', denti: [43] }] },
      { dottore: 1, paziente: 'Alessandro Lupo',  entrata: -15,consegna: -3, stato: 'finito',    colore: 'A2', tipologia: 'Corona singola',             strutture: [{ tipo: 'corona_singola', denti: [46] }] },

      // batch aggiuntivo per arrivare a 35 lavori totali
      // in_attesa (+2)
      { dottore: 5, paziente: 'Nicola Ferri',     entrata: 0,  consegna: 15, stato: 'in_attesa', colore: 'A2', tipologia: 'Ponte 4 elementi posteriore', istruzioni: 'Antagonista in zirconio', strutture: [{ tipo: 'ponte', denti: [34, 35, 36, 37] }] },
      { dottore: 6, paziente: 'Cristina Sartori', entrata: 1,  consegna: 20, stato: 'in_attesa', colore: 'BL2', tipologia: 'Corona estetica monolitica', strutture: [{ tipo: 'corona_singola', denti: [22] }] },

      // in_corso (+3)
      { dottore: 2, paziente: 'Matteo Barbieri',  entrata: -2, consegna: 8,  stato: 'in_corso',  colore: 'A3', tipologia: 'Ponte 3 elementi anteriore',  strutture: [{ tipo: 'ponte', denti: [22, 23, 24] }] },
      { dottore: 4, paziente: 'Lucia Fontana',    entrata: -3, consegna: 6,  stato: 'in_corso',  colore: 'A1', tipologia: 'Faccette 4 elementi', istruzioni: 'Riduzione vestibolare 0.5mm', strutture: [{ tipo: 'corona_singola', denti: [12] }, { tipo: 'corona_singola', denti: [11] }, { tipo: 'corona_singola', denti: [21] }, { tipo: 'corona_singola', denti: [22] }] },
      { dottore: 3, paziente: 'Vincenzo Palermo', entrata: -5, consegna: 4,  stato: 'in_corso',  colore: 'A3.5', tipologia: 'Corona su impianto molare', strutture: [{ tipo: 'corona_singola', denti: [46] }] },

      // in_prova (+2)
      { dottore: 5, paziente: 'Ilaria Colombo',   entrata: -7, consegna: 2,  stato: 'in_prova',  colore: 'B1', tipologia: 'Prova estetica faccetta',     strutture: [{ tipo: 'corona_singola', denti: [11] }] },
      { dottore: 6, paziente: 'Giovanni Caputo',  entrata: -8, consegna: 0,  stato: 'in_prova',  colore: 'A3', tipologia: 'Prova metallo ponte',         strutture: [{ tipo: 'ponte', denti: [35, 36, 37] }] },

      // finito (+3)
      { dottore: 3, paziente: 'Rita Mancini',     entrata: -25,consegna: -11,stato: 'finito',    colore: 'A2', tipologia: 'Corona zirconio molare',      strutture: [{ tipo: 'corona_singola', denti: [27] }] },
      { dottore: 4, paziente: 'Antonio Serra',    entrata: -32,consegna: -18,stato: 'finito',    colore: 'A3', tipologia: 'Scheletrato superiore',       strutture: [{ tipo: 'corona_singola', denti: [14] }, { tipo: 'corona_singola', denti: [16] }, { tipo: 'corona_singola', denti: [24] }, { tipo: 'corona_singola', denti: [26] }] },
      { dottore: 5, paziente: 'Sofia Marini',     entrata: -19,consegna: -6, stato: 'finito',    colore: 'BL2', tipologia: 'Ponte estetico monolitico',  strutture: [{ tipo: 'ponte', denti: [13, 12, 11] }] },
    ];

    let lavoroIdx = 0;
    for (const l of lavori) {
      // Alterniamo gli operatori per dare varietà alle statistiche.
      const operatoreCreazione = (lavoroIdx % 2) + 1; // 1=Admin Demo, 2=Tecnico Demo
      lavoroIdx++;

      const lavoroResult = await c.query<{ id: number }>(
        `INSERT INTO lavori
           (id_dottore, nome_paziente, data_entrata, data_consegna, stato,
            scala_colori, tipologia_lavoro, note_istruzioni, id_operatore_creazione,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::stato_lavoro, $6, $7, $8, $9, $10, $10)
         RETURNING id`,
        [
          l.dottore, l.paziente, dateOffset(l.entrata), dateOffset(l.consegna),
          l.stato, l.colore, l.tipologia, l.istruzioni ?? null,
          operatoreCreazione, tsOffset(l.entrata, 9, 30),
        ],
      );
      const idLavoro = lavoroResult.rows[0]!.id;

      for (const s of l.strutture) {
        await c.query(
          `INSERT INTO lavori_strutture (id_lavoro, tipo_struttura, elementi_dentali)
           VALUES ($1, $2, $3)`,
          [idLavoro, s.tipo, s.denti],
        );
      }

      // ---------- AUDIT LOG ricostruito ----------
      // Evento "creazione" sempre.
      await c.query(
        `INSERT INTO audit_log (id_operatore, azione, entita, id_entita, dettagli, created_at)
         VALUES ($1, 'CREATE_LAVORO', 'lavori', $2, $3, $4)`,
        [
          operatoreCreazione, idLavoro,
          JSON.stringify({ paziente: l.paziente, n_strutture: l.strutture.length }),
          tsOffset(l.entrata, 9, 30),
        ],
      );

      // Cambi stato in base allo stato finale del lavoro.
      // Calcolo i giorni intermedi proporzionalmente all'intervallo
      // entrata→consegna così le date sono coerenti.
      const span = l.consegna - l.entrata;
      // Tempistica tipica nel laboratorio: subito in lavorazione, poi prova
      // qualche giorno prima della consegna, poi finito alla consegna.
      const giornoInCorso = l.entrata + Math.max(1, Math.floor(span * 0.15));
      const giornoInProva = l.entrata + Math.max(2, Math.floor(span * 0.7));
      const giornoFinito  = l.consegna;

      const cambi: Array<{ da: string; a: string; quando: number; ora: number }> = [];
      if (l.stato === 'in_corso' || l.stato === 'in_prova' || l.stato === 'finito') {
        cambi.push({ da: 'in_attesa', a: 'in_corso', quando: giornoInCorso, ora: 10 });
      }
      if (l.stato === 'in_prova' || l.stato === 'finito') {
        cambi.push({ da: 'in_corso', a: 'in_prova', quando: giornoInProva, ora: 14 });
      }
      if (l.stato === 'finito') {
        cambi.push({ da: 'in_prova', a: 'finito', quando: giornoFinito, ora: 16 });
      }
      for (const cambio of cambi) {
        const opCambio = ((cambio.quando + lavoroIdx) % 2) + 1;
        await c.query(
          `INSERT INTO audit_log (id_operatore, azione, entita, id_entita, dettagli, created_at)
           VALUES ($1, 'CAMBIO_STATO_LAVORO', 'lavori', $2, $3, $4)`,
          [
            opCambio, idLavoro,
            JSON.stringify({ da: cambio.da, a: cambio.a }),
            tsOffset(cambio.quando, cambio.ora, 0),
          ],
        );
      }

      // Consumo materiale (in_corso, in_prova, finito).
      if (l.stato !== 'in_attesa') {
        const idCollaboratore = ((idLavoro - 1) % 4) + 1;
        await c.query(
          `INSERT INTO lavori_assegnazioni
             (id_lavoro, id_collaboratore, mansione, assegnato_at, id_operatore_assegnazione)
           VALUES ($1,$2,'CAD',$3,$4)`,
          [idLavoro, idCollaboratore, tsOffset(giornoInCorso, 10, 15), operatoreCreazione],
        );
        if (l.stato === 'in_prova' || l.stato === 'finito') {
          const secondo = (idCollaboratore % 4) + 1;
          await c.query(
            `INSERT INTO lavori_assegnazioni
               (id_lavoro, id_collaboratore, mansione, assegnato_at, id_operatore_assegnazione)
             VALUES ($1,$2,'Rifinitura',$3,$4)`,
            [idLavoro, secondo, tsOffset(giornoInProva - 1, 9, 0), operatoreCreazione],
          );
        }

        const idMaterialeMap: Record<string, number> = {
          A1: 1, A2: 2, A3: 3, BL2: 4, B1: 5,
        };
        const idMat = idMaterialeMap[l.colore] ?? 2;
        const quandoUso = giornoInCorso + 1;

        const matResult = await c.query<{ id: number }>(
          `INSERT INTO lavori_materiali
             (id_lavoro, id_materiale, quantita_usata, unita_misura, note,
              id_operatore, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            idLavoro, idMat, 1, 'pz', `Fresatura ${l.tipologia}`,
            operatoreCreazione, tsOffset(quandoUso, 11, 0),
          ],
        );
        await c.query(
          `INSERT INTO audit_log (id_operatore, azione, entita, id_entita, dettagli, created_at)
           VALUES ($1, 'REGISTRA_MATERIALE', 'lavori_materiali', $2, $3, $4)`,
          [
            operatoreCreazione, matResult.rows[0]!.id,
            JSON.stringify({ id_lavoro: idLavoro, id_materiale: idMat }),
            tsOffset(quandoUso, 11, 0),
          ],
        );
        // Aggiungo anche un audit "duplicato" sull'entità lavori così
        // appare nella timeline del dettaglio lavoro (che filtra per entita='lavori').
        await c.query(
          `INSERT INTO audit_log (id_operatore, azione, entita, id_entita, dettagli, created_at)
           VALUES ($1, 'REGISTRA_MATERIALE', 'lavori', $2, $3, $4)`,
          [
            operatoreCreazione, idLavoro,
            JSON.stringify({ id_materiale: idMat, quantita: 1, unita: 'pz' }),
            tsOffset(quandoUso, 11, 0),
          ],
        );
      }
    }

    await c.query(`
      INSERT INTO macchinari (nome, marca, modello, matricola, ubicazione, note) VALUES
        ('Fresatore principale', 'imes-icore', 'CORiTEC 350i', 'DEMO-350-01', 'Sala fresatura', 'Pulizia mandrino giornaliera'),
        ('Forno sinterizzazione', 'VITA', 'ZYRCOMAT 6000 MS', 'DEMO-ZYR-02', 'Sala forni', NULL),
        ('Stampante 3D', 'Formlabs', 'Form 4B', 'DEMO-F4B-03', 'Area digitale', 'Usare solo resine certificate')
    `);
    await c.query(
      `INSERT INTO manutenzioni_programmate
         (id_macchinario, titolo, descrizione, prossima_scadenza, preavviso_giorni, ricorrenza_valore, ricorrenza_unita)
       VALUES
         (1, 'Pulizia mandrino', 'Pulizia e lubrificazione completa', $1, 3, 30, 'giorni'),
         (2, 'Calibrazione temperatura', 'Controllo con termocoppia certificata', $2, 7, 6, 'mesi'),
         (3, 'Sostituzione filtro aria', 'Sostituire filtro e verificare aspirazione', $3, 5, 3, 'mesi')`,
      [dateOffset(0), dateOffset(5), dateOffset(30)],
    );
    await c.query(
      `INSERT INTO manutenzioni_interventi
         (id_manutenzione, scadenza_prevista, completata_at, note, id_operatore)
       VALUES (1, $1, $2, 'Pulizia completata senza anomalie', 1)`,
      [dateOffset(-30), tsOffset(-30, 8, 30)],
    );

    await c.query('COMMIT');

    const counts = await c.query<{ stato: string; n: string }>(
      `SELECT stato, COUNT(*)::int AS n FROM lavori GROUP BY stato ORDER BY stato`,
    );
    const auditCount = await c.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM audit_log`,
    );
    const lmCount = await c.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM lavori_materiali`,
    );

    console.log('\nSeed demo completato.');
    console.log('Distribuzione lavori:');
    for (const r of counts.rows) console.log(`  ${r.stato.padEnd(12)}  ${r.n}`);
    console.log(`  audit_log:    ${auditCount.rows[0]!.n} eventi`);
    console.log(`  lavori_materiali: ${lmCount.rows[0]!.n} consumi`);
    console.log('\nOperatori demo (autenticazione resta sul main DB):');
    console.log('  Admin Demo / 0000');
    console.log('  Tecnico Demo / 0000');
    console.log('\nPer attivare un account: dal main DB, marca un operatore con usa_demo=true.');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

main()
  .catch((err) => {
    console.error('Seed demo fallito:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
