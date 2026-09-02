export type StatoPrelievoMateriale = 'nuovo' | 'parziale';
export type StatoUtilizzoMateriale = 'nuovo' | 'parziale' | 'esaurito';

export interface MaterialInventory {
  quantitaNuova: number;
  quantitaParziale: number;
}

export interface MaterialUsagePlan extends MaterialInventory {
  stato: StatoUtilizzoMateriale;
}

const PRECISION = 1_000;
const EPSILON = 0.000_001;

function roundQuantity(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export function materialState(
  quantitaNuova: number,
  quantitaParziale: number,
): StatoUtilizzoMateriale {
  if (quantitaNuova <= EPSILON && quantitaParziale <= EPSILON) return 'esaurito';
  if (quantitaParziale > EPSILON) return 'parziale';
  return 'nuovo';
}

/**
 * Calcola il movimento di magazzino senza effetti collaterali.
 *
 * Un'unita nuova, al primo utilizzo, passa nella disponibilita parziale.
 * Un'unita gia parziale puo essere associata ad altri lavori senza essere
 * duplicata o scalata: resta riutilizzabile finche l'operatore non aggiorna
 * la disponibilita dal magazzino.
 */
export function planMaterialUsage(
  inventory: MaterialInventory,
  statoPrelievo: StatoPrelievoMateriale,
  quantitaUsata: number,
): MaterialUsagePlan {
  if (!Number.isFinite(quantitaUsata) || quantitaUsata <= 0) {
    throw new Error('La quantità utilizzata deve essere maggiore di zero');
  }

  const quantitaNuova = roundQuantity(inventory.quantitaNuova);
  const quantitaParziale = roundQuantity(inventory.quantitaParziale);
  const disponibile = statoPrelievo === 'nuovo' ? quantitaNuova : quantitaParziale;

  if (quantitaUsata > disponibile + EPSILON) {
    const label = statoPrelievo === 'nuovo' ? 'nuova' : 'parziale';
    throw new Error(`Quantità ${label} insufficiente: disponibile ${disponibile}`);
  }

  if (statoPrelievo === 'parziale') {
    return {
      quantitaNuova,
      quantitaParziale,
      stato: materialState(quantitaNuova, quantitaParziale),
    };
  }

  const nuovaResidua = roundQuantity(quantitaNuova - quantitaUsata);
  const nuovaParziale = roundQuantity(quantitaParziale + quantitaUsata);
  return {
    quantitaNuova: nuovaResidua,
    quantitaParziale: nuovaParziale,
    stato: materialState(nuovaResidua, nuovaParziale),
  };
}
