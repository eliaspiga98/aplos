-- Fasi produttive dettagliate e archivio recuperabile dei lavori finiti.
-- Il vecchio valore `in_corso` diventa `in_corso_cad`, preservando tutti i
-- lavori gia presenti senza conversioni manuali.

ALTER TYPE stato_lavoro RENAME VALUE 'in_corso' TO 'in_corso_cad';
ALTER TYPE stato_lavoro ADD VALUE 'attesa_rifinitura' AFTER 'in_corso_cad';
ALTER TYPE stato_lavoro ADD VALUE 'in_corso_rifinitura' AFTER 'attesa_rifinitura';

ALTER TABLE lavori
  ADD COLUMN finito_at TIMESTAMPTZ,
  ADD COLUMN archiviato_at TIMESTAMPTZ,
  ADD COLUMN id_operatore_archiviazione BIGINT REFERENCES operatori(id);

UPDATE lavori l
SET finito_at = COALESCE(
  (
    SELECT MAX(a.created_at)
    FROM audit_log a
    WHERE a.entita = 'lavori'
      AND a.id_entita = l.id
      AND a.azione = 'CAMBIO_STATO_LAVORO'
      AND a.dettagli ->> 'a' = 'finito'
  ),
  l.updated_at
)
WHERE l.stato = 'finito' AND l.finito_at IS NULL;

ALTER TABLE app_settings
  ADD COLUMN archiviazione_lavori_giorni INTEGER NOT NULL DEFAULT 15
    CHECK (archiviazione_lavori_giorni BETWEEN 0 AND 365);

CREATE INDEX idx_lavori_archivio
  ON lavori (archiviato_at DESC)
  WHERE deleted_at IS NULL AND archiviato_at IS NOT NULL;
