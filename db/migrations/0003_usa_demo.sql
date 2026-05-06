-- Flag per-operatore che indica "questo account vede il DB demo invece del DB
-- di produzione". Utile per dare al cliente un account di prova senza
-- condividere i dati reali del laboratorio.
--
-- L'autenticazione resta sul DB principale; cambia solo il pool su cui
-- vengono effettuate le query di lavori/dottori/materiali/audit/AI.

BEGIN;

ALTER TABLE operatori ADD COLUMN usa_demo BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
