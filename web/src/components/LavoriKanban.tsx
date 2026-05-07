import { useState } from 'react';
import { api, ApiError, type Lavoro, type StatoLavoro } from '../api';
import { useToast } from './Toaster';

interface Props {
  lavori: Lavoro[];
  onChange: (next: Lavoro[]) => void;
  onOpen: (id: number) => void;
}

const COLUMNS: Array<{ key: StatoLavoro; label: string }> = [
  { key: 'in_attesa', label: 'In attesa' },
  { key: 'in_corso',  label: 'In corso' },
  { key: 'in_prova',  label: 'In prova' },
  { key: 'finito',    label: 'Finito' },
];

function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function LavoriKanban({ lavori, onChange, onOpen }: Props) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<StatoLavoro | null>(null);
  const { push } = useToast();

  const grouped = COLUMNS.reduce(
    (acc, c) => { acc[c.key] = []; return acc; },
    {} as Record<StatoLavoro, Lavoro[]>,
  );
  for (const l of lavori) {
    if (grouped[l.stato]) grouped[l.stato].push(l);
  }
  for (const k of Object.keys(grouped) as StatoLavoro[]) {
    grouped[k].sort((a, b) => a.data_consegna.localeCompare(b.data_consegna));
  }

  async function handleDrop(e: React.DragEvent, stato: StatoLavoro) {
    e.preventDefault();
    setDragOver(null);
    if (dragId == null) return;
    const lavoro = lavori.find((l) => l.id === dragId);
    if (!lavoro || lavoro.stato === stato) return;
    // Optimistic update
    const prev = lavori;
    onChange(lavori.map((l) => l.id === dragId ? { ...l, stato } : l));
    try {
      await api.post(`/api/lavori/${dragId}/stato`, { stato });
    } catch (err) {
      onChange(prev); // rollback
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
    setDragId(null);
  }

  return (
    <div className="kanban">
      {COLUMNS.map((col) => (
        <div
          key={col.key}
          className={`kanban-col${dragOver === col.key ? ' kanban-col--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
          onDragLeave={() => setDragOver((curr) => curr === col.key ? null : curr)}
          onDrop={(e) => void handleDrop(e, col.key)}
        >
          <header className={`kanban-col-header kanban-col-header--${col.key}`}>
            <span>{col.label}</span>
            <span className="kanban-col-count">{grouped[col.key].length}</span>
          </header>
          <div className="kanban-cards">
            {grouped[col.key].map((l) => {
              const days = daysFromToday(l.data_consegna);
              const overdue = l.stato !== 'finito' && days < 0;
              const urgent = l.stato !== 'finito' && days >= 0 && days <= 2;
              return (
                <article
                  key={l.id}
                  className={
                    'kanban-card' +
                    (overdue ? ' kanban-card--overdue' : '') +
                    (urgent ? ' kanban-card--urgent' : '')
                  }
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null); }}
                  onClick={() => onOpen(l.id)}
                >
                  <header className="kanban-card-head">
                    <span className="kanban-card-id">#{l.id}</span>
                    {overdue && <span className="kanban-card-flag kanban-card-flag--overdue">{Math.abs(days)}gg ritardo</span>}
                    {urgent && <span className="kanban-card-flag kanban-card-flag--urgent">
                      {days === 0 ? 'Oggi' : days === 1 ? 'Domani' : `${days}gg`}
                    </span>}
                  </header>
                  <div className="kanban-card-paziente">{l.nome_paziente}</div>
                  <div className="kanban-card-meta muted">
                    {l.dottore_nome}
                    {l.dottore_studio ? ` — ${l.dottore_studio}` : ''}
                  </div>
                  <footer className="kanban-card-foot muted">
                    Consegna: {new Date(l.data_consegna).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  </footer>
                </article>
              );
            })}
            {grouped[col.key].length === 0 && (
              <div className="kanban-empty muted">Nessun lavoro</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
