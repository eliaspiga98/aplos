import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

interface Message {
  role: 'user' | 'ai' | 'error';
  text: string;
  righe?: number;
  dati?: Array<Record<string, unknown>>;
}

interface ChatResponse {
  sql: string;
  righe: number;
  dati: Array<Record<string, unknown>>;
  risposta: string;
}

interface AiHealth {
  status: 'ok' | 'model_not_installed' | 'error';
  model?: string;
  installed?: string[];
  error?: string;
}

const DEFAULT_W = 460;
const DEFAULT_H = 620;
const MIN_W = 360;
const MIN_H = 420;
const MAX_W = 1200;
const STORAGE_W = 'aplos:ai-panel:w';
const STORAGE_H = 'aplos:ai-panel:h';

const SUGGESTIONS = [
  'Quanti lavori sono in corso?',
  'Quali lavori sono in scadenza?',
  'Materiali sotto soglia',
  'Lavori che usano zirconio',
];

// Colonne sempre nascoste nella DataTable della chat (rumore tecnico).
const HIDDEN_COLUMNS = new Set([
  'created_at', 'updated_at', 'deleted_at',
  'pin_hash', 'attributi_extra', 'storage_path',
  'id_operatore_creazione', 'id_operatore',
]);

function isHiddenColumn(name: string): boolean {
  if (HIDDEN_COLUMNS.has(name)) return true;
  if (name !== 'id' && name.startsWith('id_')) return true;
  return false;
}

const COLUMN_LABELS: Record<string, string> = {
  id: '#', nome_paziente: 'Paziente', data_entrata: 'Entrata', data_consegna: 'Consegna',
  stato: 'Stato', scala_colori: 'Colore', tipologia_lavoro: 'Tipologia',
  note_istruzioni: 'Note', dottore_nome: 'Dottore', dottore_studio: 'Studio',
  nome_file: 'File', size_bytes: 'Dimensione', mime_type: 'Tipo',
  categoria: 'Categoria', marca: 'Marca', colore: 'Colore', lotto: 'Lotto',
  deposito: 'Deposito', altezza_mm: 'Altezza (mm)', larghezza_mm: 'Larghezza (mm)',
  quantita: 'Quantità', unita_misura: 'Unità', stato_utilizzo: 'Stato',
  soglia_alert: 'Soglia', nome: 'Nome', studio: 'Studio',
  telefono: 'Telefono', email: 'Email', ruolo: 'Ruolo',
  totale: 'Totale', count: 'Totale',
};

function formatCell(key: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return key.startsWith('data_') ? d.toLocaleDateString('it-IT') : d.toLocaleString('it-IT');
      }
    }
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

interface RowAction { type: 'lavoro' | 'dottore' | 'materiale'; to: string }

function detectRowAction(row: Record<string, unknown>): RowAction | null {
  const keys = Object.keys(row);
  const id = row['id'];
  if (id == null) return null;
  if (keys.includes('nome_paziente')) return { type: 'lavoro', to: `/lavori?open=${id}` };
  if (keys.includes('lotto') && keys.includes('categoria')) {
    return { type: 'materiale', to: `/materiali?q=${encodeURIComponent(String(row['lotto']))}` };
  }
  if (keys.includes('studio') || (keys.includes('nome') && keys.includes('email'))) {
    return { type: 'dottore', to: `/dottori?q=${encodeURIComponent(String(row['nome']))}` };
  }
  return null;
}

function DataTable({
  rows, onRowClick,
}: {
  rows: Array<Record<string, unknown>>;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  if (rows.length === 0) return null;
  const allKeys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) allKeys.add(k);
  const columns = Array.from(allKeys).filter((k) => !isHiddenColumn(k));

  if (rows.length === 1 && columns.length === 1) {
    const k = columns[0]!;
    return (
      <div className="chat-kv">
        <span className="chat-kv-key">{COLUMN_LABELS[k] ?? k}</span>
        <span className="chat-kv-val">{formatCell(k, rows[0]![k])}</span>
      </div>
    );
  }

  return (
    <table className="chat-table">
      <thead>
        <tr>{columns.map((c) => <th key={c}>{COLUMN_LABELS[c] ?? c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const clickable = !!onRowClick && detectRowAction(r) !== null;
          return (
            <tr
              key={i}
              className={clickable ? 'chat-row--clickable' : undefined}
              onClick={clickable ? () => onRowClick!(r) : undefined}
              title={clickable ? 'Apri dettaglio' : undefined}
            >
              {columns.map((c) => <td key={c}>{formatCell(c, r[c])}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function AiWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dimensioni del pannello (persistite). Memorizziamo solo a fine drag per
  // evitare scritture continue su localStorage.
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H };
    const w = Number(localStorage.getItem(STORAGE_W));
    const h = Number(localStorage.getItem(STORAGE_H));
    return {
      w: Number.isFinite(w) && w >= MIN_W ? w : DEFAULT_W,
      h: Number.isFinite(h) && h >= MIN_H ? h : DEFAULT_H,
    };
  });

  // Health check una volta sola alla prima apertura.
  useEffect(() => {
    if (!open || health) return;
    api.get<AiHealth>('/api/ai/health')
      .then(setHealth)
      .catch((err: unknown) =>
        setHealth({ status: 'error', error: err instanceof Error ? err.message : 'Errore' }),
      );
  }, [open, health]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  function handleRowClick(row: Record<string, unknown>) {
    const action = detectRowAction(row);
    if (!action) return;
    setOpen(false);
    navigate(action.to);
  }

  async function send(domandaOverride?: string) {
    const q = (domandaOverride ?? input).trim();
    if (!q || busy) return;
    if (!domandaOverride) setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const res = await api.post<ChatResponse>('/api/ai/chat', { domanda: q });
      setMessages((m) => [
        ...m,
        { role: 'ai', text: res.risposta, dati: res.dati, righe: res.righe },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Errore di rete';
      setMessages((m) => [...m, { role: 'error', text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  function handleNewChat() {
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  }

  // Drag handle in alto-sinistra: trascinare in su-sinistra ingrandisce.
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const maxH = window.innerHeight - 100;

    document.body.classList.add('is-resizing-ai');

    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const w = Math.min(MAX_W, Math.max(MIN_W, startW - dx));
      const h = Math.min(maxH, Math.max(MIN_H, startH - dy));
      setSize({ w, h });
    }
    function stop() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      document.body.classList.remove('is-resizing-ai');
      // Persist
      const cur = sizeRef.current;
      localStorage.setItem(STORAGE_W, String(cur.w));
      localStorage.setItem(STORAGE_H, String(cur.h));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  }

  // Riferimento sempre aggiornato per leggere la size finale al rilascio.
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  function resetSize() {
    setSize({ w: DEFAULT_W, h: DEFAULT_H });
    localStorage.removeItem(STORAGE_W);
    localStorage.removeItem(STORAGE_H);
  }

  return (
    <>
      <button
        type="button"
        className={`ai-fab ${open ? 'ai-fab--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Chiudi assistente' : 'Apri assistente'}
        title="Aplo's buddy"
      >
        {open ? '×' : <ChatBubbleIcon />}
      </button>

      {open && (
        <div
          className="ai-panel"
          role="dialog"
          aria-label="Aplo's buddy"
          style={{ width: size.w, height: size.h }}
        >
          {/* Resize handle in alto-sinistra (trascina per ingrandire/rimpicciolire) */}
          <div
            className="ai-panel-resize"
            onMouseDown={startResize}
            onDoubleClick={resetSize}
            title="Trascina per ridimensionare. Doppio click per resettare."
            aria-label="Ridimensiona"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M0 8 L8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M0 4 L4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <header className="ai-panel-header">
            <div className="ai-panel-title-wrap">
              <div className="ai-panel-avatar">
                <img src="/aplos_logo.jpg" alt="" />
              </div>
              <div>
                <div className="ai-panel-title">Aplo's buddy</div>
                <div className="ai-panel-status">
                  <span className={`ai-status-dot ai-status-dot--${health?.status ?? 'pending'}`} />
                  {health?.status === 'ok' ? 'pronto' :
                   health?.status === 'model_not_installed' ? 'modello mancante' :
                   health?.status === 'error' ? 'offline' : 'in connessione'}
                </div>
              </div>
            </div>
            <div className="ai-panel-actions">
              <button
                type="button"
                className="ai-panel-icon-btn"
                onClick={handleNewChat}
                disabled={messages.length === 0 && input.length === 0}
                title="Nuova chat"
                aria-label="Nuova chat"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h13M3 12h13M3 17h7" />
                  <path d="M19 13v8M15 17h8" />
                </svg>
              </button>
              <button
                type="button"
                className="ai-panel-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                title="Chiudi"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          {health && health.status !== 'ok' && (
            <div className="ai-panel-banner">
              {health.status === 'model_not_installed' && (
                <>Il modello <code>{health.model}</code> non è installato. Esegui <code>ollama pull {health.model}</code>.</>
              )}
              {health.status === 'error' && <>Ollama non raggiungibile.</>}
            </div>
          )}

          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-logo">
                  <img src="/aplos_logo.jpg" alt="" />
                </div>
                <h3>Ciao{user?.nome ? `, ${user.nome.split(' ')[0]}` : ''} 👋</h3>
                <p className="muted">
                  Sono il tuo assistente. Puoi chiedermi dati specifici sul gestionale
                  o domande generali sul software.
                </p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chat-suggestion"
                      onClick={() => void send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-row chat-row--${m.role}`}>
                {m.role !== 'user' && (
                  <div className={`chat-avatar chat-avatar--${m.role}`}>
                    {m.role === 'ai' ? (
                      <img src="/aplos_logo.jpg" alt="" />
                    ) : '!'}
                  </div>
                )}
                <div className={`chat-msg chat-msg--${m.role}`}>
                  <div className="chat-msg-text">
                    {m.text.trim().length > 0
                      ? m.text
                      : <em className="muted">(nessuna risposta testuale)</em>}
                  </div>
                  {m.dati && m.dati.length > 0 && (
                    <div className="chat-data">
                      <div className="chat-data-label">
                        {m.righe} {m.righe === 1 ? 'risultato' : 'risultati'}
                      </div>
                      <DataTable rows={m.dati} onRowClick={handleRowClick} />
                    </div>
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="chat-avatar chat-avatar--user">
                    {user?.nome?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-row chat-row--ai">
                <div className="chat-avatar chat-avatar--ai">
                  <img src="/aplos_logo.jpg" alt="" />
                </div>
                <div className="chat-msg chat-msg--ai chat-thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Chiedi qualcosa…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={busy || input.trim().length === 0}
              aria-label="Invia"
              title="Invia"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12l18-9-7 18-2-7-9-2z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
