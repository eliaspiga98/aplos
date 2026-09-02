-- Due materiali con lo stesso lotto possono essere articoli distinti quando
-- cambiano marca, colore o dimensioni. Una sola riga rappresenta invece la
-- scorta di dischi realmente identici e ne conserva la quantita aggregata.

ALTER TABLE materiali
  DROP CONSTRAINT uq_materiali_categoria_lotto;

CREATE UNIQUE INDEX uq_materiali_identita_attiva
  ON materiali (
    categoria,
    lower(btrim(lotto)),
    lower(btrim(marca)),
    lower(btrim(colore)),
    altezza_mm,
    larghezza_mm
  ) NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;
