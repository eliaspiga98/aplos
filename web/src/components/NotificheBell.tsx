import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getList, type Lavoro } from '../api';

const POLL_MS = 5 * 60 * 1000; // 5 minuti
const SOGLIA_GIORNI = 3; // notifica i lavori in scadenza nei prossimi N giorni

function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function NotificheBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Lavoro[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  async function fetchAlerts() {
    try {
      const { rows } = await getList<Lavoro>('/api/lavori?limit=200');
      const alerts = rows
        .filter((l) => l.stato !== 'finito')
        .filter((l) => daysFromToday(l.data_consegna) <= SOGLIA_GIORNI)
        .sort((a, b) => a.data_consegna.localeCompare(b.data_consegna));
      setItems(alerts);
    } catch {
      // ignora errori temporanei
    }
  }

  useEffect(() => {
    void fetchAlerts();
    const id = window.setInterval(() => void fetchAlerts(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // chiudi al click fuori
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const inRitardo = items.filter((l) => daysFromToday(l.data_consegna) < 0);
  const oggi = items.filter((l) => daysFromToday(l.data_consegna) === 0);
  const prossimi = items.filter((l) => daysFromToday(l.data_consegna) > 0);

  return (
    <div className="notifiche-wrap" ref={wrapperRef}>
      <button
        type="button"
        className="notifiche-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifiche (${items.length})`}
        title={items.length === 0 ? 'Nessuna scadenza imminente' : `${items.length} scadenze`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {items.length > 0 && (
          <span className={`notifiche-badge ${inRitardo.length > 0 ? 'notifiche-badge--alert' : ''}`}>
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="notifiche-panel">
          <header className="notifiche-panel-header">
            <strong>Scadenze ({items.length})</strong>
            <button type="button" className="btn-link" onClick={() => void fetchAlerts()}>Aggiorna</button>
          </header>
          {items.length === 0 ? (
            <p className="muted" style={{ padding: '0.85rem 1rem' }}>
              Tutto sotto controllo. Nessun lavoro in scadenza nei prossimi {SOGLIA_GIORNI} giorni.
            </p>
          ) : (
            <ul className="notifiche-list">
              {[
                ...inRitardo.map((l) => ({ l, tag: 'ritardo' as const })),
                ...oggi.map((l) => ({ l, tag: 'oggi' as const })),
                ...prossimi.map((l) => ({ l, tag: 'prossimo' as const })),
              ].map(({ l, tag }) => (
                <li
                  key={l.id}
                  className={`notifiche-item notifiche-item--${tag}`}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/lavori?open=${l.id}`);
                  }}
                >
                  <div className="notifiche-item-main">
                    <strong>{l.nome_paziente}</strong>
                    <div className="muted">{l.dottore_nome}</div>
                  </div>
                  <div className="notifiche-item-date">
                    {tag === 'ritardo'
                      ? `${Math.abs(daysFromToday(l.data_consegna))}gg ritardo`
                      : tag === 'oggi'
                        ? 'Oggi'
                        : daysFromToday(l.data_consegna) === 1
                          ? 'Domani'
                          : `Tra ${daysFromToday(l.data_consegna)}gg`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
