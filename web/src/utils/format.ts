/**
 * Formatter centralizzati per la UI: date, stati enum, etichette di campo.
 * Da usare ovunque mostriamo valori grezzi del DB all'utente.
 */

import type { CategoriaMateriale, StatoUtilizzo } from '../api';

/* ------------------------------------------------------------------ Date */

/**
 * Date ISO (yyyy-mm-dd o ISO completo) → "gg/mm/aaaa". Le date civili
 * PostgreSQL arrivano come stringhe pure e vengono formattate senza passare
 * da UTC, così il giorno scelto dall'utente resta invariato.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '—' : value.toLocaleDateString('it-IT');
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT');
}

/** Converte una data API in una Date locale, senza interpretare YYYY-MM-DD come UTC. */
export function dateAtLocalMidnight(value: string | Date): Date {
  if (value instanceof Date) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateInputValue(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = dateAtLocalMidnight(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayDateInput(): string {
  return toDateInputValue(new Date());
}

export function addDaysDateInput(days: number): string {
  const d = dateAtLocalMidnight(new Date());
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

export function daysFromToday(value: string | Date): number {
  const today = dateAtLocalMidnight(new Date());
  const target = dateAtLocalMidnight(value);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function formatDateShort(value: string | Date): string {
  const d = dateAtLocalMidnight(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* --------------------------------------------------------- Etichette enum */

export const STATO_LAVORO_LABEL: Record<string, string> = {
  in_attesa: 'In attesa',
  in_corso_cad: 'In corso CAD',
  attesa_rifinitura: 'Attesa rifinitura',
  in_corso_rifinitura: 'In corso rifinitura',
  in_prova: 'In prova',
  finito: 'Finito',
};

export const FASE_ASSEGNAZIONE_LABEL: Record<string, string> = {
  cad: 'CAD',
  rifinitura: 'Rifinitura',
  altro: 'Altro',
};

export const STATO_UTILIZZO_LABEL: Record<StatoUtilizzo, string> = {
  nuovo: 'Nuovo',
  parziale: 'Parziale',
  esaurito: 'Esaurito',
};

export const TIPO_STRUTTURA_LABEL: Record<string, string> = {
  corona_singola: 'Corona singola',
  ponte: 'Ponte',
};

export const CATEGORIA_LABEL: Record<CategoriaMateriale, string> = {
  zirconio: 'Zirconio',
  pmma: 'PMMA',
  resina: 'Resina',
  metallo: 'Metallo',
  ceramica: 'Ceramica',
  altro: 'Altro',
};

export const RUOLO_LABEL: Record<string, string> = {
  admin: 'Amministratore',
  tecnico: 'Tecnico',
};

/**
 * Fallback generico: rimuove gli underscore e capitalizza la prima lettera.
 * Da usare solo quando non c'è un dizionario dedicato.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Helper: etichetta umana dello stato lavoro con fallback.
 */
export function labelStatoLavoro(s: string | null | undefined): string {
  if (!s) return '—';
  return STATO_LAVORO_LABEL[s] ?? humanize(s);
}

export function labelStatoUtilizzo(s: string | null | undefined): string {
  if (!s) return '—';
  return STATO_UTILIZZO_LABEL[s as StatoUtilizzo] ?? humanize(s);
}

export function labelCategoria(c: string | null | undefined): string {
  if (!c) return '—';
  return CATEGORIA_LABEL[c as CategoriaMateriale] ?? humanize(c);
}

export function labelTipoStruttura(t: string | null | undefined): string {
  if (!t) return '—';
  return TIPO_STRUTTURA_LABEL[t] ?? humanize(t);
}

export function labelRuolo(r: string | null | undefined): string {
  if (!r) return '—';
  return RUOLO_LABEL[r] ?? humanize(r);
}
