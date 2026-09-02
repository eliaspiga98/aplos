-- Scorte distinte per materiale nuovo e materiale gia aperto/parziale.
-- `quantita` continua a rappresentare la disponibilita nuova per mantenere
-- compatibili i dati e le installazioni esistenti; `quantita_parziale`
-- contiene invece la disponibilita riutilizzabile gia aperta.

ALTER TABLE materiali
  ADD COLUMN quantita_parziale NUMERIC(10,3) NOT NULL DEFAULT 0;

UPDATE materiali
SET
  quantita_parziale = CASE
    WHEN stato_utilizzo = 'parziale' THEN GREATEST(COALESCE(quantita, 1), 0)
    ELSE 0
  END,
  quantita = CASE
    WHEN stato_utilizzo = 'nuovo' THEN GREATEST(COALESCE(quantita, 1), 0)
    ELSE 0
  END;

ALTER TABLE materiali
  ALTER COLUMN quantita SET DEFAULT 0,
  ALTER COLUMN quantita SET NOT NULL,
  ADD CONSTRAINT ck_materiali_quantita_nuova_non_negativa CHECK (quantita >= 0),
  ADD CONSTRAINT ck_materiali_quantita_parziale_non_negativa CHECK (quantita_parziale >= 0);

-- Registra da quale disponibilita e stato prelevato il materiale. Le righe
-- storiche restano NULL perche il dato non puo essere ricostruito con certezza.
UPDATE lavori_materiali SET quantita_usata = NULL WHERE quantita_usata <= 0;

ALTER TABLE lavori_materiali
  ADD COLUMN stato_prelievo TEXT,
  ADD CONSTRAINT ck_lavori_materiali_stato_prelievo
    CHECK (stato_prelievo IS NULL OR stato_prelievo IN ('nuovo', 'parziale')),
  ADD CONSTRAINT ck_lavori_materiali_quantita_positiva
    CHECK (quantita_usata IS NULL OR quantita_usata > 0);

CREATE INDEX idx_materiali_disponibilita
  ON materiali (id_deposito, stato_utilizzo)
  WHERE deleted_at IS NULL;
