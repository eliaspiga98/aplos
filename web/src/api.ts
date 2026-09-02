export const BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? '')
  : (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001');

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Fastify rifiuta con 400 un DELETE/POST vuoto se dichiariamo JSON senza
  // inviare alcun body. Impostiamo il content type solo quando c'e davvero
  // un payload da decodificare.
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
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
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * POST con risposta NDJSON (newline-delimited JSON). Ogni riga del body
 * è un evento JSON. Yieldata via async generator man mano che arriva.
 * Il server in errore può chiudere lo stream con un evento {type:"error"}.
 */
export async function* streamNdjsonPost<T>(
  path: string,
  body: unknown,
): AsyncGenerator<T, void, unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      const parsed = text ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        message = String((parsed as { error: unknown }).error);
      }
    } catch {
      // body non JSON, lasciamo HTTP code
    }
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.length > 0) {
        try {
          yield JSON.parse(line) as T;
        } catch {
          // riga corrotta, ignoro
        }
      }
      nl = buf.indexOf('\n');
    }
  }
  const tail = buf.trim();
  if (tail.length > 0) {
    try { yield JSON.parse(tail) as T; } catch { /* ignore */ }
  }
}

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
  lingua: 'it' | 'en';
}

export interface Operatore {
  id: number;
  nome: string;
  ruolo: 'admin' | 'tecnico';
  usa_demo: boolean;
  lingua: 'it' | 'en';
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
  assegnazioni: AssegnazioneLavoro[];
}

export interface Collaboratore {
  id: number;
  nome: string;
  telefono: string | null;
  email: string | null;
  mansioni: string | null;
  note: string | null;
  lavori_attivi?: number;
  created_at: string;
  updated_at: string;
}

export interface AssegnazioneLavoro {
  id: number;
  id_collaboratore: number;
  collaboratore_nome: string;
  mansione: string;
  assegnato_at: string;
  rimosso_at?: string | null;
  id_operatore_assegnazione?: number;
  operatore_assegnazione_nome?: string | null;
  id_operatore_rimozione?: number | null;
  operatore_rimozione_nome?: string | null;
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
export type StatoPrelievoMateriale = 'nuovo' | 'parziale';

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
  /** Disponibilita ancora nuova/non aperta. */
  quantita: string;
  quantita_parziale: string;
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

export interface Macchinario {
  id: number;
  nome: string;
  marca: string | null;
  modello: string | null;
  matricola: string | null;
  ubicazione: string | null;
  note: string | null;
  manutenzioni_attive?: number;
  prossima_manutenzione?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManutenzioneProgrammata {
  id: number;
  id_macchinario: number;
  titolo: string;
  descrizione: string | null;
  prossima_scadenza: string;
  preavviso_giorni: number;
  ricorrenza_valore: number | null;
  ricorrenza_unita: 'giorni' | 'mesi' | 'anni' | null;
  attiva: boolean;
  giorni?: number;
}

export interface InterventoManutenzione {
  id: number;
  id_manutenzione: number;
  titolo: string;
  scadenza_prevista: string;
  completata_at: string;
  note: string | null;
  operatore_nome: string | null;
}

export interface MacchinarioDettaglio extends Macchinario {
  manutenzioni: ManutenzioneProgrammata[];
  interventi: InterventoManutenzione[];
}

export interface ManutenzioneAlert {
  id: number;
  id_macchinario: number;
  titolo: string;
  prossima_scadenza: string;
  preavviso_giorni: number;
  macchinario_nome: string;
  giorni: number;
  tipo: 'preavviso' | 'scadenza';
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
  deposito_nome: string | null;
  quantita_usata: string | null;
  unita_misura: string | null;
  stato_prelievo: StatoPrelievoMateriale | null;
  note: string | null;
  created_at: string;
}

export interface MaterialUsageInput {
  id_materiale: number;
  stato_prelievo: StatoPrelievoMateriale;
  quantita_usata: number;
  note?: string;
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
  assegnazioni: AssegnazioneLavoro[];
}

export interface TimelineEvent {
  id: number;
  azione: string;
  dettagli: Record<string, unknown>;
  created_at: string;
  id_operatore: number | null;
  operatore_nome: string | null;
}

export interface DottoreStats {
  dottore: Dottore;
  counts: { in_attesa: number; in_corso: number; in_prova: number; finito: number };
  riassunto: {
    totale: number;
    in_ritardo: number;
    tempo_medio_giorni: number | null;
    tempo_medio_finiti_giorni: number | null;
  };
  ultimi: Array<{
    id: number;
    nome_paziente: string;
    data_entrata: string;
    data_consegna: string;
    stato: StatoLavoro;
    scala_colori: string | null;
    tipologia_lavoro: string | null;
  }>;
}
