import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { LavoroPreviewBlock } from './LavoroPreviewBlock';

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

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  input: string;
  /** True se è arrivata una risposta AI in questa tab e l'utente non l'ha
   *  ancora "vista" (pannello chiuso o tab non attiva). In memoria, non
   *  persisto in localStorage. */
  unread?: boolean;
}

const DEFAULT_W = 480;
const DEFAULT_H = 640;
const MIN_W = 380;
const MIN_H = 460;
const STORAGE_W = 'aplos:ai-panel:w';
const STORAGE_H = 'aplos:ai-panel:h';
const STORAGE_CHATS = 'aplos:ai-chats';
const STORAGE_ACTIVE = 'aplos:ai-active';
const MAX_TABS = 8;

const SUGGESTIONS = [
  'Quanti lavori sono in corso?',
  'Quali lavori sono in scadenza?',
  'Materiali sotto soglia',
  'Lavori che usano zirconio',
];

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
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (key.startsWith('data_') && m) return `${m[3]}/${m[2]}/${m[1]}`;
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString('it-IT');
    }
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

interface RowAction { type: 'lavoro' | 'dottore' | 'materiale'; to: string; idLavoro?: number }

function detectRowAction(row: Record<string, unknown>): RowAction | null {
  const keys = Object.keys(row);
  const id = row['id'];
  if (id == null) return null;
  if (keys.includes('nome_paziente')) {
    return { type: 'lavoro', to: `/lavori?open=${id}`, idLavoro: Number(id) };
  }
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

function newChat(): Chat {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'Nuova',
    messages: [],
    input: '',
  };
}

function loadChats(): { chats: Chat[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_CHATS);
    const activeId = localStorage.getItem(STORAGE_ACTIVE) ?? '';
    if (raw) {
      const arr = JSON.parse(raw) as Chat[];
      if (Array.isArray(arr) && arr.length > 0) {
        const resolved = arr.find((c) => c.id === activeId)?.id ?? arr[0]!.id;
        return { chats: arr, activeId: resolved };
      }
    }
  } catch {
    // ignora — partiremo con una chat nuova
  }
  const c = newChat();
  return { chats: [c], activeId: c.id };
}

export function AiWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const initial = loadChats();
  const [chats, setChats] = useState<Chat[]>(initial.chats);
  const [activeId, setActiveId] = useState<string>(initial.activeId);
  const active = chats.find((c) => c.id === activeId) ?? chats[0]!;

  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refs per leggere lo stato corrente dentro callback async.
  const openRef = useRef(open);
  const activeIdRef = useRef(activeId);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') return { w: DEFAULT_W, h: DEFAULT_H };
    const w = Number(localStorage.getItem(STORAGE_W));
    const h = Number(localStorage.getItem(STORAGE_H));
    return {
      w: Number.isFinite(w) && w >= MIN_W ? w : DEFAULT_W,
      h: Number.isFinite(h) && h >= MIN_H ? h : DEFAULT_H,
    };
  });

  // Persistenza chats. Non salviamo `unread` in localStorage: è uno stato
  // della sessione, non una proprietà permanente della chat.
  useEffect(() => {
    try {
      const toSave = chats.map(({ unread, ...rest }) => rest);
      localStorage.setItem(STORAGE_CHATS, JSON.stringify(toSave));
      localStorage.setItem(STORAGE_ACTIVE, activeId);
    } catch {
      // quota piena o private mode: ignora
    }
  }, [chats, activeId]);

  // Quando il pannello viene aperto o l'utente cambia tab attiva, la tab
  // attiva è "vista" → clear unread.
  useEffect(() => {
    if (!open) return;
    setChats((curr) => curr.map((c) =>
      c.id === activeId && c.unread ? { ...c, unread: false } : c,
    ));
  }, [open, activeId]);

  // Health check al primo open
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
  }, [open, activeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active.messages, open, activeId]);

  function patchActive(patch: Partial<Chat>) {
    setChats((curr) => curr.map((c) => c.id === activeId ? { ...c, ...patch } : c));
  }

  function handleRowClick(row: Record<string, unknown>) {
    const action = detectRowAction(row);
    if (!action) return;
    setOpen(false);
    navigate(action.to);
  }

  async function send(domandaOverride?: string) {
    const q = (domandaOverride ?? active.input).trim();
    if (!q || busy) return;

    // Imposta titolo della tab dalla prima domanda
    const newTitle = active.messages.length === 0
      ? (q.length > 28 ? q.slice(0, 28) + '…' : q)
      : active.title;

    patchActive({
      input: domandaOverride ? active.input : '',
      messages: [...active.messages, { role: 'user', text: q }],
      title: newTitle,
    });
    setBusy(true);

    // Capturiamo la tab al momento dell'invio: se l'utente cambia tab durante
    // l'attesa, la risposta arriverà comunque nella tab giusta.
    const targetChatId = activeId;
    try {
      const res = await api.post<ChatResponse>('/api/ai/chat', { domanda: q });
      setChats((curr) => curr.map((c) => c.id === targetChatId ? {
        ...c,
        messages: [
          ...c.messages,
          { role: 'ai', text: res.risposta, dati: res.dati, righe: res.righe },
        ],
        unread: shouldMarkUnread(targetChatId) ? true : c.unread,
      } : c));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Errore di rete';
      setChats((curr) => curr.map((c) => c.id === targetChatId ? {
        ...c,
        messages: [...c.messages, { role: 'error', text: msg }],
        unread: shouldMarkUnread(targetChatId) ? true : c.unread,
      } : c));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Una nuova risposta è "unread" se al momento del rientro non viene letta
   * dall'utente: pannello chiuso, oppure aperto ma su una tab diversa.
   */
  function shouldMarkUnread(chatId: string): boolean {
    return !openRef.current || activeIdRef.current !== chatId;
  }

  function openNewTab() {
    if (chats.length >= MAX_TABS) return;
    const c = newChat();
    setChats((curr) => [...curr, c]);
    setActiveId(c.id);
  }

  function closeTab(id: string) {
    setChats((curr) => {
      const next = curr.filter((c) => c.id !== id);
      if (next.length === 0) {
        const created = newChat();
        setActiveId(created.id);
        return [created];
      }
      if (id === activeId) setActiveId(next[0]!.id);
      return next;
    });
  }

  function clearActive() {
    patchActive({ messages: [], input: '', title: 'Nuova' });
    inputRef.current?.focus();
  }

  // Drag handle in alto-sinistra. Limiti massimi = viewport (lasciamo solo
  // un piccolo margine per non incollare il pannello agli angoli).
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = size.w, startH = size.h;
    document.body.classList.add('is-resizing-ai');
    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // Margine destra/bottom = posizione FAB; margine top/sinistra = 1rem.
      const maxW = window.innerWidth - 3 * 16; // 3rem totali
      const maxH = window.innerHeight - 6 * 16; // 6rem (FAB sotto + spazio)
      const w = Math.min(maxW, Math.max(MIN_W, startW - dx));
      const h = Math.min(maxH, Math.max(MIN_H, startH - dy));
      setSize({ w, h });
    }
    function stop() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      document.body.classList.remove('is-resizing-ai');
      const cur = sizeRef.current;
      localStorage.setItem(STORAGE_W, String(cur.w));
      localStorage.setItem(STORAGE_H, String(cur.h));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  }
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  function resetSize() {
    setSize({ w: DEFAULT_W, h: DEFAULT_H });
    localStorage.removeItem(STORAGE_W);
    localStorage.removeItem(STORAGE_H);
  }

  const totalUnread = chats.filter((c) => c.unread).length;
  const showUnreadBadge = totalUnread > 0 && !open;

  return (
    <>
      <button
        type="button"
        className={`ai-fab ${open ? 'ai-fab--open' : ''} ${showUnreadBadge ? 'ai-fab--unread' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Chiudi assistente' : `Apri assistente${totalUnread > 0 ? ` (${totalUnread} non letti)` : ''}`}
        title={totalUnread > 0 && !open ? `${totalUnread} risposte non lette` : "Aplo's buddy"}
      >
        {open ? '×' : <ChatBubbleIcon />}
        {showUnreadBadge && <span className="ai-fab-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div
          className="ai-panel"
          role="dialog"
          aria-label="Aplo's buddy"
          style={{ width: size.w, height: size.h }}
        >
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
                onClick={clearActive}
                disabled={active.messages.length === 0 && active.input.length === 0}
                title="Pulisci questa scheda"
                aria-label="Pulisci"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1.4 14.1A2 2 0 0 1 15.6 22H8.4a2 2 0 0 1-2-1.9L5 6" />
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

          {/* Tab bar */}
          <div className="ai-tabs" role="tablist">
            {chats.map((c) => (
              <div
                key={c.id}
                role="tab"
                aria-selected={c.id === activeId}
                className={
                  'ai-tab' +
                  (c.id === activeId ? ' ai-tab--active' : '') +
                  (c.unread && c.id !== activeId ? ' ai-tab--unread' : '')
                }
                onClick={() => setActiveId(c.id)}
                title={c.unread && c.id !== activeId ? `${c.title} (nuove risposte)` : c.title}
              >
                {c.unread && c.id !== activeId && <span className="ai-tab-dot" aria-hidden="true" />}
                <span className="ai-tab-title">{c.title || 'Nuova'}</span>
                <button
                  type="button"
                  className="ai-tab-close"
                  onClick={(e) => { e.stopPropagation(); closeTab(c.id); }}
                  aria-label="Chiudi scheda"
                  title="Chiudi scheda"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ai-tab-new"
              onClick={openNewTab}
              disabled={chats.length >= MAX_TABS}
              title={chats.length >= MAX_TABS ? `Massimo ${MAX_TABS} schede` : 'Nuova scheda'}
              aria-label="Nuova scheda"
            >
              +
            </button>
          </div>

          {health && health.status !== 'ok' && (
            <div className="ai-panel-banner">
              {health.status === 'model_not_installed' && (
                <>Il modello <code>{health.model}</code> non è installato.</>
              )}
              {health.status === 'error' && <>Ollama non raggiungibile.</>}
            </div>
          )}

          <div className="chat-messages" ref={scrollRef}>
            {active.messages.length === 0 && (
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
            {active.messages.map((m, i) => {
              // Quando il risultato è un singolo lavoro, mostriamo la mini-card
              // ricca con odontogramma e allegati. La detezione è sulla shape
              // dei dati: 1 riga, contiene `nome_paziente` e `id`.
              const singleLavoroId =
                m.role === 'ai' &&
                m.dati && m.dati.length === 1 &&
                'nome_paziente' in m.dati[0]! && 'id' in m.dati[0]!
                  ? Number(m.dati[0]!['id'])
                  : null;
              return (
                <div key={i} className={`chat-row chat-row--${m.role}`}>
                  {m.role !== 'user' && (
                    <div className={`chat-avatar chat-avatar--${m.role}`}>
                      {m.role === 'ai' ? <img src="/aplos_logo.jpg" alt="" /> : '!'}
                    </div>
                  )}
                  <div className={`chat-msg chat-msg--${m.role}`}>
                    <div className="chat-msg-text">
                      {m.text.trim().length > 0
                        ? m.text
                        : <em className="muted">(nessuna risposta testuale)</em>}
                    </div>
                    {singleLavoroId != null ? (
                      <LavoroPreviewBlock idLavoro={singleLavoroId} />
                    ) : (
                      m.dati && m.dati.length > 0 && (
                        <div className="chat-data">
                          <div className="chat-data-label">
                            {m.righe} {m.righe === 1 ? 'risultato' : 'risultati'}
                          </div>
                          <DataTable rows={m.dati} onRowClick={handleRowClick} />
                        </div>
                      )
                    )}
                  </div>
                  {m.role === 'user' && (
                    <div className="chat-avatar chat-avatar--user">
                      {user?.nome?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
              );
            })}
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
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Chiedi qualcosa…"
              value={active.input}
              onChange={(e) => patchActive({ input: e.target.value })}
              disabled={busy}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={busy || active.input.trim().length === 0}
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
