/**
 * Formatter centralizzati per la UI: date, stati enum, etichette di campo.
 * Da usare ovunque mostriamo valori grezzi del DB all'utente.
 */

import type { CategoriaMateriale, StatoUtilizzo } from '../api';

/* ------------------------------------------------------------------ Date */

/**
 * Date ISO (yyyy-mm-dd o ISO completo) → "gg/mm/aaaa". Le date "pure" sono
 * salvate come timestamp UTC midnight: stampandole in IT ricevono lo shift
 * di timezone, quindi parsiamo manualmente i primi 10 caratteri se sono
 * solo data.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '—' : value.toLocaleDateString('it-IT');
  }
  // Date "pure" salvate come ISO con T00:00 — usiamo le componenti UTC per
  // evitare lo shift di timezone (Europa/Roma sposta indietro di 2 ore).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT');
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
  in_corso: 'In corso',
  in_prova: 'In prova',
  finito: 'Finito',
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
