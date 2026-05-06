export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
}

/**
 * Variante di GET per le liste paginate: legge `X-Total-Count` dal response
 * header e lo restituisce insieme alle righe. Se l'header manca (route non
 * paginata) il totale è uguale alla lunghezza dell'array.
 */
export async function getList<T>(path: string): Promise<PagedResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`, { credentials: 'include' });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  const rows = body as T[];
  const totalHeader = res.headers.get('x-total-count');
  const total = totalHeader != null ? Number(totalHeader) : rows.length;
  return { rows, total };
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Upload multipart: NON usa la funzione `request` standard perché non vogliamo
 * l'header `Content-Type: application/json` — il browser deve impostare
 * `multipart/form-data; boundary=…` da solo.
 */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'error' in body)
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export interface User {
  id: number;
  nome: string;
  ruolo: 'admin' | 'tecnico';
  usa_demo?: boolean;
}

export interface Operatore {
  id: number;
  nome: string;
  ruolo: 'admin' | 'tecnico';
  usa_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lavoro {
  id: number;
  nome_paziente: string;
  data_entrata: string;
  data_consegna: string;
  stato: 'in_attesa' | 'in_corso' | 'in_prova' | 'finito';
  scala_colori: string | null;
  tipologia_lavoro: string | null;
  id_dottore: number;
  dottore_nome: string;
  dottore_studio: string | null;
}

export interface Dottore {
  id: number;
  nome: string;
  studio: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  note?: string | null;
}

export type CategoriaMateriale =
  | 'zirconio' | 'pmma' | 'resina' | 'metallo' | 'ceramica' | 'altro';

export type StatoUtilizzo = 'nuovo' | 'parziale' | 'esaurito';

export type StatoLavoro = 'in_attesa' | 'in_corso' | 'in_prova' | 'finito';

export interface Materiale {
  id: number;
  categoria: CategoriaMateriale;
  sottotipo: string | null;
  marca: string | null;
  colore: string | null;
  lotto: string;
  id_deposito: number | null;
  deposito_nome: string | null;
  stato_utilizzo: StatoUtilizzo;
  altezza_mm: string | null;
  larghezza_mm: string | null;
  quantita: string | null;
  unita_misura: string | null;
  soglia_alert: string | null;
}

export interface Deposito {
  id: number;
  nome: string;
  descrizione: string | null;
  n_materiali?: number;
  created_at: string;
  updated_at: string;
}

export interface StrutturaSalvata {
  id: number;
  tipo_struttura: 'corona_singola' | 'ponte';
  elementi_dentali: number[];
}

export interface MaterialeConsumato {
  id: number;
  id_materiale: number;
  categoria: CategoriaMateriale;
  lotto: string;
  marca: string | null;
  colore: string | null;
  quantita_usata: string | null;
  unita_misura: string | null;
  note: string | null;
  created_at: string;
}

export interface Allegato {
  id: number;
  nome_file: string;
  mime_type: string | null;
  size_bytes: string | null;
  created_at: string;
}

export interface LavoroDettaglio extends Lavoro {
  data_entrata: string;
  note_istruzioni: string | null;
  strutture: StrutturaSalvata[];
  allegati: Allegato[];
  materiali: MaterialeConsumato[];
}
