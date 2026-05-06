/**
 * Seed del DB demo (DEMO_DATABASE_URL). Popola con dati realistici per
 * dimostrare l'app a un cliente:
 *   - 5 depositi
 *   - 6 dottori
 *   - 15 materiali (varie categorie e stati)
 *   - 2 operatori demo (Admin Demo / Cliente Demo)
 *   - 25 lavori distribuiti per stato e date
 *   - strutture odontogramma + materiali consumati
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
  return d.toISOString().slice(0, 10);
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
    `);

    // 2. Truncate dati (lascia schema_migrations).
    await c.query(`
      TRUNCATE
        audit_log, lavori_allegati, lavori_materiali, lavori_strutture,
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
    ];

    for (const l of lavori) {
      const lavoroResult = await c.query<{ id: number }>(
        `INSERT INTO lavori
           (id_dottore, nome_paziente, data_entrata, data_consegna, stato,
            scala_colori, tipologia_lavoro, note_istruzioni, id_operatore_creazione)
         VALUES ($1, $2, $3, $4, $5::stato_lavoro, $6, $7, $8, 1)
         RETURNING id`,
        [
          l.dottore, l.paziente, dateOffset(l.entrata), dateOffset(l.consegna),
          l.stato, l.colore, l.tipologia, l.istruzioni ?? null,
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

      // Per i lavori in_corso/in_prova/finito aggiungo qualche consumo
      // materiale per dimostrare la tracciabilità.
      if (l.stato !== 'in_attesa') {
        const idMaterialeMap: Record<string, number> = {
          A1: 1, A2: 2, A3: 3, BL2: 4, B1: 5,
        };
        const idMat = idMaterialeMap[l.colore] ?? 2;
        await c.query(
          `INSERT INTO lavori_materiali
             (id_lavoro, id_materiale, quantita_usata, unita_misura, note, id_operatore)
           VALUES ($1, $2, $3, $4, $5, 1)`,
          [idLavoro, idMat, 1, 'pz', `Fresatura ${l.tipologia}`],
        );
      }
    }

    await c.query('COMMIT');

    const counts = await c.query<{ stato: string; n: string }>(
      `SELECT stato, COUNT(*)::int AS n FROM lavori GROUP BY stato ORDER BY stato`,
    );
    console.log('\nSeed demo completato. Distribuzione lavori:');
    for (const r of counts.rows) console.log(`  ${r.stato.padEnd(12)}  ${r.n}`);
    console.log('\nDottori, materiali, depositi seedati. Operatori demo:');
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
