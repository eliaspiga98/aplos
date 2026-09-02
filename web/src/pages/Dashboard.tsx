import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getList, type Lavoro, type Materiale } from '../api';
import { useAuth } from '../auth';
import {
  IconBriefcase, IconClock, IconAlert, IconCheck, IconBox,
} from '../components/icons';
import { CalendarView } from '../components/CalendarView';
import { daysFromToday, formatDateShort, labelCategoria, labelStatoLavoro } from '../utils/format';

const SCADENZA_GIORNI = 7;
const COLS = 24;              // 24 colonne → granularità orizzontale fine
const ROW_HEIGHT_PX = 32;     // riga compatta: la matrice è la vera unità
                              // di ridimensionamento, i widget la riempiono
                              // a piacere
const GAP_PX = 8;
const MAX_ROWS = 200;
const LAYOUT_STORAGE_PREFIX = 'aplos:dashboard:v2';

function isSottoSoglia(m: Materiale): boolean {
  if (!m.soglia_alert) return false;
  const soglia = Number(m.soglia_alert);
  const q = Number(m.quantita) + Number(m.quantita_parziale);
  return q <= soglia;
}

function deadlineLabel(d: number): { text: string; tone: 'critical' | 'warning' | 'ok' } {
  if (d < 0) return { text: `${Math.abs(d)} ${Math.abs(d) === 1 ? 'giorno' : 'giorni'} di ritardo`, tone: 'critical' };
  if (d === 0) return { text: 'Oggi', tone: 'critical' };
  if (d === 1) return { text: 'Domani', tone: 'warning' };
  if (d <= 3) return { text: `Tra ${d} giorni`, tone: 'warning' };
  return { text: `Tra ${d} giorni`, tone: 'ok' };
}

interface BoardData {
  user: { id: number; nome: string; usa_demo?: boolean } | null;
  lavori: Lavoro[];
  materiali: Materiale[];
  loading: boolean;
  navigate: (to: string) => void;
}

interface WidgetDef {
  id: string;
  title: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  render: (data: BoardData) => ReactNode;
}

/* ============================== WIDGET ============================== */

function HeroWidget({ user, lavori }: BoardData) {
  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const inScadenza = lavori
    .filter((l) => l.stato !== 'finito')
    .filter((l) => daysFromToday(l.data_consegna) <= SCADENZA_GIORNI);
  return (
    <header className="dashboard-hero">
      <div>
        <div className="dashboard-greeting">
          Ciao, <strong>{user?.nome}</strong>
          {user?.usa_demo && <span className="badge-demo" style={{ marginLeft: '0.6rem' }}>DEMO</span>}
        </div>
        <div className="dashboard-date">{oggi}</div>
      </div>
      <div className="dashboard-hero-counts">
        <div>
          <div className="dashboard-hero-num">{lavori.filter((l) => l.stato !== 'finito').length}</div>
          <div className="dashboard-hero-label">Lavori attivi</div>
        </div>
        <div>
          <div className="dashboard-hero-num">{inScadenza.length}</div>
          <div className="dashboard-hero-label">In scadenza ({SCADENZA_GIORNI}gg)</div>
        </div>
      </div>
    </header>
  );
}

function KpiWidget({ lavori, materiali }: BoardData) {
  const counts = lavori.reduce((acc, l) => { acc[l.stato] = (acc[l.stato] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const sottoSoglia = materiali.filter(isSottoSoglia);
  const esauriti = materiali.filter((m) => m.stato_utilizzo === 'esaurito');
  return (
    <div className="kpi-grid">
      <KpiCard icon={<IconBriefcase />} label="In attesa" value={counts['in_attesa'] ?? 0} tone="neutral" />
      <KpiCard icon={<IconClock />} label="In corso" value={counts['in_corso'] ?? 0} tone="active" />
      <KpiCard icon={<IconAlert />} label="In prova" value={counts['in_prova'] ?? 0} tone="prova" />
      <KpiCard icon={<IconCheck />} label="Finiti" value={counts['finito'] ?? 0} tone="success" />
      <KpiCard icon={<IconBox />} label="Materiali sotto soglia" value={sottoSoglia.length + esauriti.length}
        tone={(sottoSoglia.length + esauriti.length) > 0 ? 'warn' : 'neutral'} />
    </div>
  );
}

function CodaWidget({ lavori, loading, navigate }: BoardData) {
  const codaConsegne = lavori
    .filter((l) => l.stato !== 'finito')
    .sort((a, b) => a.data_consegna.localeCompare(b.data_consegna));
  return (
    <section className="card card--scrollable">
      <header className="card-header">
        <h2>Coda consegne</h2>
        <span className="muted">{codaConsegne.length} attivi</span>
      </header>
      {loading ? <SkeletonRows />
        : codaConsegne.length === 0 ? <EmptyState text="Nessun lavoro attivo" />
        : (
          <ul className="queue">
            {codaConsegne.slice(0, 12).map((l) => {
              const d = daysFromToday(l.data_consegna);
              const lbl = deadlineLabel(d);
              return (
                <li key={l.id} className={`queue-item queue-item--${l.stato}`}
                    onClick={() => navigate(`/lavori?open=${l.id}`)}>
                  <div className="queue-item-main">
                    <div className="queue-item-paziente">
                      {l.nome_paziente}
                      <span className={`stato-pill stato-pill--${l.stato}`}>{labelStatoLavoro(l.stato)}</span>
                    </div>
                    <div className="queue-item-meta muted">
                      #{l.id} · {l.dottore_nome}
                      {l.dottore_studio ? ` — ${l.dottore_studio}` : ''}
                    </div>
                  </div>
                  <div className={`queue-item-deadline queue-deadline--${lbl.tone}`}>
                    <div className="queue-deadline-rel">{lbl.text}</div>
                    <div className="queue-deadline-date">
                      {formatDateShort(l.data_consegna)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      {codaConsegne.length > 12 && (
        <footer className="card-footer">
          <button type="button" className="btn-link" onClick={() => navigate('/lavori')}>
            Vedi tutti i {codaConsegne.length} lavori →
          </button>
        </footer>
      )}
    </section>
  );
}

function MagazzinoWidget({ materiali, loading, navigate }: BoardData) {
  const sottoSoglia = materiali.filter(isSottoSoglia);
  const esauriti = materiali.filter((m) => m.stato_utilizzo === 'esaurito');
  return (
    <section className="card card--scrollable">
      <header className="card-header">
        <h2>Magazzino</h2>
        <span className="muted">{sottoSoglia.length} sotto soglia · {esauriti.length} esauriti</span>
      </header>
      {loading ? <SkeletonRows />
        : sottoSoglia.length === 0 && esauriti.length === 0
          ? <EmptyState text="Tutto sotto controllo" tone="success" />
          : (
            <ul className="material-alerts">
              {[...esauriti, ...sottoSoglia.filter((m) => !esauriti.includes(m))].slice(0, 12).map((m) => (
                <li key={m.id} className={`material-alert material-alert--${m.stato_utilizzo}`}
                    onClick={() => navigate(`/materiali?q=${encodeURIComponent(m.lotto)}`)}>
                  <div>
                    <div className="material-alert-title">
                      {labelCategoria(m.categoria)} {m.marca ?? ''} {m.colore ?? ''}
                    </div>
                    <div className="muted">Lotto {m.lotto}</div>
                  </div>
                  <div className="material-alert-status">
                    {m.stato_utilizzo === 'esaurito'
                      ? <span className="stato-pill stato-pill--esaurito">Esaurito</span>
                      : (
                        <span className="muted">
                          {Number(m.quantita) + Number(m.quantita_parziale)} {m.unita_misura ?? ''}
                          {' '}/ {m.soglia_alert}
                        </span>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

function CalendarioWidget({ lavori, navigate }: BoardData) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>Calendario consegne</h2>
        <button type="button" className="btn-link" onClick={() => navigate('/calendario')}>
          Vista completa →
        </button>
      </header>
      <CalendarView
        lavori={lavori}
        compact
        onLavoroClick={(id) => navigate(`/lavori?open=${id}`)}
      />
    </section>
  );
}

function DistribuzioneWidget({ lavori, loading }: BoardData) {
  const stati = ['in_attesa', 'in_corso', 'in_prova', 'finito'] as const;
  const counts = lavori.reduce((acc, l) => { acc[l.stato] = (acc[l.stato] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const total = lavori.length;
  return (
    <section className="card card--scrollable">
      <header className="card-header">
        <h2>Distribuzione lavori</h2>
        <span className="muted">{total} totali</span>
      </header>
      {loading ? <SkeletonRows />
        : total === 0 ? <EmptyState text="Nessun lavoro" />
        : (
          <ul className="bar-chart">
            {stati.map((s) => {
              const n = counts[s] ?? 0;
              const pct = total > 0 ? (n / total) * 100 : 0;
              return (
                <li key={s} className="bar-row">
                  <div className="bar-label">
                    <span>{labelStatoLavoro(s)}</span>
                    <span className="muted">{n} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="bar-track">
                    <div className={`bar-fill bar-fill--${s}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

function TopDottoriWidget({ lavori, loading, navigate }: BoardData) {
  const byDottore = useMemo(() => {
    const map = new Map<number, { id: number; nome: string; studio: string | null; n: number; attivi: number }>();
    for (const l of lavori) {
      const cur = map.get(l.id_dottore) ?? { id: l.id_dottore, nome: l.dottore_nome, studio: l.dottore_studio, n: 0, attivi: 0 };
      cur.n += 1;
      if (l.stato !== 'finito') cur.attivi += 1;
      map.set(l.id_dottore, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [lavori]);
  return (
    <section className="card card--scrollable">
      <header className="card-header">
        <h2>Top dottori</h2>
        <span className="muted">per volume</span>
      </header>
      {loading ? <SkeletonRows />
        : byDottore.length === 0 ? <EmptyState text="Nessun dottore" />
        : (
          <ul className="top-list">
            {byDottore.map((d, i) => (
              <li key={d.id} className="top-item"
                  onClick={() => navigate(`/dottori?q=${encodeURIComponent(d.nome)}`)}>
                <div className="top-rank">{i + 1}</div>
                <div className="top-main">
                  <div className="top-name">{d.nome}</div>
                  {d.studio && <div className="muted top-sub">{d.studio}</div>}
                </div>
                <div className="top-stats">
                  <div><strong>{d.n}</strong> totali</div>
                  <div className="muted">{d.attivi} attivi</div>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function SettimanaWidget({ lavori, loading }: BoardData) {
  const finiti = lavori.filter((l) => l.stato === 'finito' && daysFromToday(l.data_consegna) >= -7 && daysFromToday(l.data_consegna) <= 0).length;
  const inScadenza = lavori.filter((l) => l.stato !== 'finito' && daysFromToday(l.data_consegna) >= 0 && daysFromToday(l.data_consegna) <= 7).length;
  const inRitardo = lavori.filter((l) => l.stato !== 'finito' && daysFromToday(l.data_consegna) < 0).length;
  return (
    <section className="card">
      <header className="card-header"><h2>Questa settimana</h2></header>
      {loading ? <SkeletonRows /> : (
        <div className="settimana-grid">
          <div className="settimana-cell"><div className="settimana-num">{finiti}</div><div className="muted">Finiti negli ultimi 7gg</div></div>
          <div className="settimana-cell"><div className="settimana-num">{inScadenza}</div><div className="muted">Da consegnare nei prossimi 7gg</div></div>
          <div className={`settimana-cell ${inRitardo > 0 ? 'settimana-cell--warn' : ''}`}><div className="settimana-num">{inRitardo}</div><div className="muted">Lavori in ritardo</div></div>
        </div>
      )}
    </section>
  );
}

function AttivitaWidget({ lavori, loading, navigate }: BoardData) {
  const recenti = useMemo(() => [...lavori]
    .filter((l) => l.stato !== 'finito')
    .sort((a, b) => a.data_consegna.localeCompare(b.data_consegna))
    .slice(0, 5), [lavori]);
  return (
    <section className="card card--scrollable">
      <header className="card-header"><h2>Lavori da seguire</h2><span className="muted">prossimi 5</span></header>
      {loading ? <SkeletonRows />
        : recenti.length === 0 ? <EmptyState text="Nessun lavoro attivo" />
        : (
          <ul className="top-list">
            {recenti.map((l) => (
              <li key={l.id} className="top-item" onClick={() => navigate(`/lavori?open=${l.id}`)}>
                <div className="top-main">
                  <div className="top-name">{l.nome_paziente}</div>
                  <div className="muted top-sub">
                    {l.dottore_nome} · {formatDateShort(l.data_consegna)}
                  </div>
                </div>
                <span className={`stato-pill stato-pill--${l.stato}`}>{labelStatoLavoro(l.stato)}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

const WIDGETS: Record<string, WidgetDef> = {
  hero:           { id: 'hero',           title: 'Saluto + sommario', defaultW: 24, defaultH: 5,  minW: 12, minH: 4,  render: (d) => <HeroWidget {...d} /> },
  kpi:            { id: 'kpi',            title: 'KPI',               defaultW: 24, defaultH: 5,  minW: 12, minH: 4,  render: (d) => <KpiWidget {...d} /> },
  coda:           { id: 'coda',           title: 'Coda consegne',     defaultW: 14, defaultH: 15, minW: 8,  minH: 8,  render: (d) => <CodaWidget {...d} /> },
  magazzino:      { id: 'magazzino',      title: 'Magazzino',         defaultW: 10, defaultH: 15, minW: 8,  minH: 8,  render: (d) => <MagazzinoWidget {...d} /> },
  calendario:     { id: 'calendario',     title: 'Calendario',        defaultW: 24, defaultH: 20, minW: 12, minH: 12, render: (d) => <CalendarioWidget {...d} /> },
  distribuzione:  { id: 'distribuzione',  title: 'Distribuzione',     defaultW: 12, defaultH: 10, minW: 8,  minH: 7,  render: (d) => <DistribuzioneWidget {...d} /> },
  topDottori:     { id: 'topDottori',     title: 'Top dottori',       defaultW: 12, defaultH: 13, minW: 8,  minH: 8,  render: (d) => <TopDottoriWidget {...d} /> },
  settimana:      { id: 'settimana',      title: 'Settimana',         defaultW: 12, defaultH: 8,  minW: 8,  minH: 5,  render: (d) => <SettimanaWidget {...d} /> },
  attivita:       { id: 'attivita',       title: 'Lavori da seguire', defaultW: 12, defaultH: 13, minW: 8,  minH: 8,  render: (d) => <AttivitaWidget {...d} /> },
};

interface LayoutItem { id: string; col: number; row: number; w: number; h: number }

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'hero',          col: 1,  row: 1,  w: 24, h: 5  },
  { id: 'kpi',           col: 1,  row: 6,  w: 24, h: 5  },
  { id: 'coda',          col: 1,  row: 11, w: 14, h: 15 },
  { id: 'magazzino',     col: 15, row: 11, w: 10, h: 15 },
  { id: 'distribuzione', col: 1,  row: 26, w: 12, h: 10 },
  { id: 'topDottori',    col: 13, row: 26, w: 12, h: 13 },
  { id: 'calendario',    col: 1,  row: 39, w: 24, h: 20 },
];

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  if (a.id === b.id) return false;
  if (a.col + a.w <= b.col) return false;
  if (b.col + b.w <= a.col) return false;
  if (a.row + a.h <= b.row) return false;
  if (b.row + b.h <= a.row) return false;
  return true;
}

function findFreeSlot(layout: LayoutItem[], w: number, h: number): { col: number; row: number } {
  for (let row = 1; row <= MAX_ROWS; row++) {
    for (let col = 1; col + w - 1 <= COLS; col++) {
      const candidate: LayoutItem = { id: '__test__', col, row, w, h };
      if (layout.every((o) => !overlaps(candidate, o))) return { col, row };
    }
  }
  return { col: 1, row: MAX_ROWS };
}

/** Spinge verso il basso ogni widget che si sovrappone a `movedId`,
 *  cascading: se un widget spinto va a finire sopra un altro, anche
 *  quest'ultimo viene spinto. `movedId` non viene mai mosso. */
function pushItemsDown(layout: LayoutItem[], movedId: string): LayoutItem[] {
  const byId = new Map(layout.map((x) => [x.id, { ...x }]));
  const queue: string[] = [movedId];
  let safety = 0;

  while (queue.length > 0 && safety++ < 5000) {
    const id = queue.shift()!;
    const item = byId.get(id);
    if (!item) continue;
    for (const other of byId.values()) {
      if (other.id === id) continue;
      if (overlaps(item, other)) {
        const newRow = item.row + item.h;
        if (other.row < newRow) {
          other.row = newRow;
          if (!queue.includes(other.id)) queue.push(other.id);
        }
      }
    }
  }
  return Array.from(byId.values());
}

/** Compatta verso l'alto: ogni widget viene tirato su finché non incontra
 *  un altro widget o il bordo. `pinnedId` (se presente) resta fermo. */
function compactVertically(layout: LayoutItem[], pinnedId?: string): LayoutItem[] {
  const sorted = [...layout].sort((a, b) => a.row - b.row || a.col - b.col);
  const placed: LayoutItem[] = [];
  for (const item of sorted) {
    if (item.id === pinnedId) {
      placed.push({ ...item });
      continue;
    }
    let row = 1;
    let safety = 0;
    while (safety++ < MAX_ROWS) {
      const candidate: LayoutItem = { ...item, row };
      const collide = placed.some((p) => overlaps(p, candidate));
      if (!collide) break;
      row++;
    }
    placed.push({ ...item, row });
  }
  return placed;
}

/** Applica una variazione (move o resize) al widget `id` partendo da uno
 *  snapshot del layout (tipicamente quello catturato all'inizio del drag),
 *  con clamp ai bordi della griglia e push degli altri widget verso il
 *  basso. Tornare allo snapshot di partenza ad ogni tick rende il drag
 *  reversibile (gli altri widget non "rimangono spinti" se torno indietro). */
function applyDragChange(
  startLayout: LayoutItem[],
  id: string,
  change: Partial<Pick<LayoutItem, 'col' | 'row' | 'w' | 'h'>>,
): LayoutItem[] {
  const start = startLayout.find((x) => x.id === id);
  if (!start) return startLayout;
  let col = change.col ?? start.col;
  let row = change.row ?? start.row;
  let w = change.w ?? start.w;
  let h = change.h ?? start.h;
  if (w < 1) w = 1;
  if (h < 1) h = 1;
  if (w > COLS) w = COLS;
  if (col < 1) col = 1;
  if (col + w - 1 > COLS) col = Math.max(1, COLS - w + 1);
  if (row < 1) row = 1;
  const candidate: LayoutItem = { ...start, col, row, w, h };
  const next = startLayout.map((x) => (x.id === id ? candidate : { ...x }));
  return pushItemsDown(next, id);
}

function loadLayout(userId: number | undefined): LayoutItem[] {
  if (!userId) return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}:${userId}`);
    if (!raw) return DEFAULT_LAYOUT;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_LAYOUT;
    const valid = arr.every((x) =>
      x && typeof x === 'object' && 'id' in x && 'col' in x && 'row' in x && 'w' in x && 'h' in x && x.id in WIDGETS,
    );
    if (!valid) return DEFAULT_LAYOUT;
    return arr as LayoutItem[];
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(user?.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setLayout(loadLayout(user?.id)); }, [user?.id]);
  useEffect(() => {
    if (user?.id) {
      try { localStorage.setItem(`${LAYOUT_STORAGE_PREFIX}:${user.id}`, JSON.stringify(layout)); }
      catch { /* quota */ }
    }
  }, [layout, user?.id]);

  useEffect(() => {
    Promise.all([
      getList<Lavoro>('/api/lavori?limit=500'),
      getList<Materiale>('/api/materiali?limit=500'),
    ])
      .then(([l, m]) => { setLavori(l.rows); setMateriali(m.rows); })
      .finally(() => setLoading(false));
  }, []);

  const data: BoardData = useMemo(
    () => ({ user: user ?? null, lavori, materiali, loading, navigate }),
    [user, lavori, materiali, loading, navigate],
  );

  const presentIds = new Set(layout.map((l) => l.id));
  const available = Object.keys(WIDGETS).filter((id) => !presentIds.has(id));

  // Numero righe attualmente occupate (per dimensionare correttamente la
  // griglia di sfondo in edit mode).
  const totalRows = layout.reduce((max, x) => Math.max(max, x.row + x.h - 1), 1);

  /** Misura la larghezza di una cella basandosi sulla larghezza effettiva
   *  della board: (boardWidth - gap*(COLS-1)) / COLS. */
  function cellWidthPx(): number {
    const board = boardRef.current;
    if (!board) return 80;
    return (board.clientWidth - GAP_PX * (COLS - 1)) / COLS;
  }

  function startMove(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const startLayout = layoutRef.current.map((x) => ({ ...x }));
    const startItem = startLayout.find((x) => x.id === id);
    if (!startItem) return;

    const cw = cellWidthPx();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    document.body.classList.add('is-dashboard-dragging');
    setActiveId(id);

    function move(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      const dCol = Math.round(dx / (cw + GAP_PX));
      const dRow = Math.round(dy / (ROW_HEIGHT_PX + GAP_PX));
      const targetCol = startItem!.col + dCol;
      const targetRow = startItem!.row + dRow;
      setLayout(applyDragChange(startLayout, id, { col: targetCol, row: targetRow }));
    }
    function stop() {
      document.body.classList.remove('is-dashboard-dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      setActiveId(null);
      setLayout((curr) => compactVertically(curr, id));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  }

  function startResize(e: React.MouseEvent, id: string, dir: 'r' | 'b' | 'br') {
    e.preventDefault();
    e.stopPropagation();
    const startLayout = layoutRef.current.map((x) => ({ ...x }));
    const startItem = startLayout.find((x) => x.id === id);
    if (!startItem) return;
    const def = WIDGETS[id]!;

    const cw = cellWidthPx();
    const startMouseX = e.clientX, startMouseY = e.clientY;
    document.body.classList.add('is-dashboard-resizing', `is-resize-${dir}`);
    setActiveId(id);

    function move(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      const dCol = Math.round(dx / (cw + GAP_PX));
      const dRow = Math.round(dy / (ROW_HEIGHT_PX + GAP_PX));
      const nextW = dir === 'b'
        ? startItem!.w
        : Math.max(def.minW, startItem!.w + dCol);
      const nextH = dir === 'r'
        ? startItem!.h
        : Math.max(def.minH, startItem!.h + dRow);
      setLayout(applyDragChange(startLayout, id, { w: nextW, h: nextH }));
    }
    function stop() {
      document.body.classList.remove('is-dashboard-resizing', 'is-resize-r', 'is-resize-b', 'is-resize-br');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      setActiveId(null);
      setLayout((curr) => compactVertically(curr, id));
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  }

  function remove(id: string) {
    setLayout((curr) => curr.filter((x) => x.id !== id));
  }
  function add(id: string) {
    const def = WIDGETS[id]; if (!def) return;
    const slot = findFreeSlot(layoutRef.current, def.defaultW, def.defaultH);
    setLayout((curr) => [...curr, { id, col: slot.col, row: slot.row, w: def.defaultW, h: def.defaultH }]);
  }
  function reset() { setLayout(DEFAULT_LAYOUT); }

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
    gridAutoRows: `${ROW_HEIGHT_PX}px`,
    gap: `${GAP_PX}px`,
    minHeight: editing ? `${(totalRows + 2) * (ROW_HEIGHT_PX + GAP_PX)}px` : undefined,
  };

  return (
    <div className="page dashboard">
      <header className="dashboard-toolbar">
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <div className="page-actions">
          {editing && (
            <button type="button" className="btn-secondary" onClick={reset} title="Ripristina layout default">
              Reset layout
            </button>
          )}
          <button
            type="button"
            className={editing ? '' : 'btn-secondary'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '✓ Fatto' : '⚙ Modifica dashboard'}
          </button>
        </div>
      </header>

      <div
        ref={boardRef}
        className={`dashboard-board ${editing ? 'dashboard-board--editing' : ''}`}
        style={gridStyle}
      >
        {layout.map((item) => {
          const w = WIDGETS[item.id];
          if (!w) return null;
          return (
            <div
              key={item.id}
              className={`dashboard-widget ${activeId === item.id ? 'dashboard-widget--active' : ''}`}
              style={{
                gridColumn: `${item.col} / span ${item.w}`,
                gridRow: `${item.row} / span ${item.h}`,
              }}
            >
              {editing && (
                <div
                  className="dashboard-widget-toolbar"
                  onMouseDown={(e) => startMove(e, item.id)}
                  title="Trascina per spostare"
                >
                  <span className="dashboard-widget-handle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </span>
                  <span className="dashboard-widget-name">{w.title}</span>
                  <span className="dashboard-widget-size muted">
                    {item.w}×{item.h}
                  </span>
                  <button
                    type="button"
                    className="dashboard-widget-remove"
                    onClick={(e) => { e.stopPropagation(); remove(item.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Rimuovi widget"
                    aria-label={`Rimuovi ${w.title}`}
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="dashboard-widget-content">{w.render(data)}</div>

              {editing && (
                <>
                  <div className="resize-handle resize-handle--r"
                       onMouseDown={(e) => startResize(e, item.id, 'r')}
                       title="Trascina per cambiare larghezza" />
                  <div className="resize-handle resize-handle--b"
                       onMouseDown={(e) => startResize(e, item.id, 'b')}
                       title="Trascina per cambiare altezza" />
                  <div className="resize-handle resize-handle--br"
                       onMouseDown={(e) => startResize(e, item.id, 'br')}
                       title="Trascina per ridimensionare" />
                </>
              )}
            </div>
          );
        })}

        {editing && available.length > 0 && (
          <div className="dashboard-add" style={{ gridColumn: '1 / -1', gridRow: `${totalRows + 1} / span 2` }}>
            <div className="dashboard-add-label">Aggiungi widget alla dashboard</div>
            <div className="dashboard-add-list">
              {available.map((id) => (
                <button key={id} type="button" className="btn-secondary" onClick={() => add(id)}>
                  + {WIDGETS[id]!.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {layout.length === 0 && !editing && (
          <p className="muted" style={{ gridColumn: '1 / -1' }}>
            Nessun widget. Premi "⚙ Modifica dashboard" per aggiungerne.
          </p>
        )}
      </div>
    </div>
  );
}

interface KpiProps {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: 'neutral' | 'active' | 'prova' | 'success' | 'warn';
}
function KpiCard({ icon, label, value, tone = 'neutral' }: KpiProps) {
  return (
    <div className={`kpi-card kpi-card--${tone}`}>
      <div className="kpi-card-icon">{icon}</div>
      <div>
        <div className="kpi-card-value">{value}</div>
        <div className="kpi-card-label">{label}</div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-list">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
    </div>
  );
}
function EmptyState({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' }) {
  return (
    <div className={`empty-state ${tone === 'success' ? 'empty-state--success' : ''}`}>
      {tone === 'success' ? '✓ ' : ''}{text}
    </div>
  );
}
