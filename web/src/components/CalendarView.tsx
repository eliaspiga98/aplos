import { useMemo, useState } from 'react';
import type { Lavoro } from '../api';

const STATO_LABEL: Record<string, string> = {
  in_attesa: 'In attesa', in_corso: 'In corso', in_prova: 'In prova', finito: 'Finito',
};
const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const DAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

interface Cell {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  lavori: Lavoro[];
}

function buildGrid(year: number, month: number, lavori: Lavoro[]): Cell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byIso = new Map<string, Lavoro[]>();
  for (const l of lavori) {
    const iso = l.data_consegna.slice(0, 10);
    const arr = byIso.get(iso) ?? [];
    arr.push(l);
    byIso.set(iso, arr);
  }

  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({
      date: d,
      iso,
      inMonth: d.getMonth() === month,
      isToday: d.getTime() === today.getTime(),
      lavori: (byIso.get(iso) ?? []).sort((a, b) => a.nome_paziente.localeCompare(b.nome_paziente)),
    });
  }
  return cells;
}

interface Props {
  lavori: Lavoro[];
  /** Quando true il calendario riempie tutto lo spazio disponibile del padre. */
  fillHeight?: boolean;
  /** Modalità compatta (celle più piccole, max 3 eventi). Per la dashboard. */
  compact?: boolean;
  /** Callback alla pressione su un lavoro. Default: navigate `/lavori?open=<id>`. */
  onLavoroClick?: (id: number) => void;
}

export function CalendarView({ lavori, fillHeight = false, compact = false, onLavoroClick }: Props) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const grid = useMemo(
    () => buildGrid(cursor.year, cursor.month, lavori),
    [cursor.year, cursor.month, lavori],
  );

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const m = month + delta;
      const newY = year + Math.floor(m / 12);
      const newM = ((m % 12) + 12) % 12;
      return { year: newY, month: newM };
    });
  }
  function goToday() {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  const eventCap = compact ? 3 : 4;

  return (
    <div className={`calendar-view ${fillHeight ? 'calendar-view--fill' : ''} ${compact ? 'calendar-view--compact' : ''}`}>
      <header className="calendar-toolbar">
        <h2 className="calendar-month">{MONTHS_IT[cursor.month]} {cursor.year}</h2>
        <div className="calendar-nav">
          <button type="button" className="btn-secondary" onClick={() => shiftMonth(-1)} aria-label="Mese precedente">‹</button>
          <button type="button" className="btn-secondary" onClick={goToday}>Oggi</button>
          <button type="button" className="btn-secondary" onClick={() => shiftMonth(1)} aria-label="Mese successivo">›</button>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar-head">
          {DAYS_IT.map((d) => <div key={d} className="calendar-day-name">{d}</div>)}
        </div>
        <div className="calendar-grid">
          {grid.map((c) => (
            <div
              key={c.iso}
              className={
                'calendar-cell' +
                (c.inMonth ? '' : ' calendar-cell--off') +
                (c.isToday ? ' calendar-cell--today' : '')
              }
            >
              <div className="calendar-cell-date">
                {c.date.getDate()}
                {c.lavori.length > 0 && (
                  <span className="calendar-cell-count">{c.lavori.length}</span>
                )}
              </div>
              <div className="calendar-cell-events">
                {c.lavori.slice(0, eventCap).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`calendar-event calendar-event--${l.stato}`}
                    onClick={() => onLavoroClick?.(l.id)}
                    title={`${l.nome_paziente} — ${l.dottore_nome} (${STATO_LABEL[l.stato]})`}
                  >
                    <span className="calendar-event-paziente">{l.nome_paziente}</span>
                    <span className="calendar-event-dot" />
                  </button>
                ))}
                {c.lavori.length > eventCap && (
                  <div className="calendar-event-more">+{c.lavori.length - eventCap} altri</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!compact && (
        <div className="calendar-legend">
          {Object.entries(STATO_LABEL).map(([k, v]) => (
            <span key={k} className="calendar-legend-item">
              <span className={`calendar-legend-dot calendar-legend-dot--${k}`} />
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
