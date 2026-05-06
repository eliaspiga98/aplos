/**
 * Numerazione FDI: denti permanenti 11-18, 21-28, 31-38, 41-48 (quadrante +
 * posizione 1..8 dal centro). Decidui 51-55, 61-65, 71-75, 81-85.
 *
 * Validiamo lato app perché è più semplice da estendere e perché i CHECK
 * constraint sull'array in Postgres sarebbero verbosi.
 */
export function isValidFDIToothNumber(n: number): boolean {
  if (!Number.isInteger(n)) return false;
  const quadrant = Math.floor(n / 10);
  const position = n % 10;
  if (position < 1) return false;
  // Permanenti
  if (quadrant >= 1 && quadrant <= 4 && position <= 8) return true;
  // Decidui
  if (quadrant >= 5 && quadrant <= 8 && position <= 5) return true;
  return false;
}

export function validateToothArray(elementi: number[]): string | null {
  if (elementi.length === 0) return 'Nessun dente specificato';
  for (const n of elementi) {
    if (!isValidFDIToothNumber(n)) {
      return `Numero dente non valido (FDI): ${n}`;
    }
  }
  if (new Set(elementi).size !== elementi.length) {
    return 'Denti duplicati nella stessa struttura';
  }
  return null;
}
