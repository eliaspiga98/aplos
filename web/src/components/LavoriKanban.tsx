import { useState } from 'react';
import { api, ApiError, type Lavoro, type StatoLavoro } from '../api';
import { useToast } from './Toaster';
import { daysFromToday, formatDateShort } from '../utils/format';
import { AssegnazioniModal } from './AssegnazioniModal';
import { useConfirm } from './ConfirmDialog';

interface Props {
  lavori: Lavoro[];
  onChange: (next: Lavoro[]) => void;
  onOpen: (id: number) => void;
  onRefresh: () => void;
}

const COLUMNS: Array<{ key: StatoLavoro; label: string }> = [
  { key: 'in_attesa', label: 'In attesa' },
  { key: 'in_corso_cad', label: 'In corso CAD' },
  { key: 'attesa_rifinitura', label: 'Attesa rifinitura' },
  { key: 'in_corso_rifinitura', label: 'In corso rifinitura' },
  { key: 'in_prova',  label: 'In prova' },
  { key: 'finito',    label: 'Finito' },
];

export function LavoriKanban({ lavori, onChange, onOpen, onRefresh }: Props) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<StatoLavoro | null>(null);
  const [pendingMove, setPendingMove] = useState<{ id: number; stato: StatoLavoro } | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

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
    if (stato === 'in_corso_cad' || stato === 'in_corso_rifinitura') {
      setPendingMove({ id: dragId, stato });
      setDragId(null);
      return;
    }
    if (stato === 'finito') {
      const ok = await confirm({
        title: 'Confermare il completamento?',
        message: `Il lavoro #${dragId} verrà spostato in Finito e gli incarichi attivi saranno completati.`,
        confirmText: 'Sì, è finito',
      });
      if (!ok) {
        setDragId(null);
        return;
      }
    }
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

  return <>
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
                  {l.assegnazioni.length > 0 && <div className="kanban-assignees">
                    {l.assegnazioni.map((a) => <span className={`assignment-chip assignment-chip--${a.stato_incarico}`} key={a.id} title={a.mansione}>
                      {a.collaboratore_nome} · {a.fase === 'cad' ? 'CAD' : a.fase === 'rifinitura' ? 'Rif.' : a.mansione}
                    </span>)}
                  </div>}
                  <footer className="kanban-card-foot muted">
                    Consegna: {formatDateShort(l.data_consegna)}
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
    {pendingMove && <AssegnazioniModal
      open
      idLavoro={pendingMove.id}
      targetState={pendingMove.stato}
      current={lavori.find((l) => l.id === pendingMove.id)?.assegnazioni}
      onClose={() => setPendingMove(null)}
      onSaved={(next) => {
        if (next) onChange(lavori.map((l) => l.id === pendingMove.id ? { ...l, stato: next } : l));
        onRefresh();
      }}
    />}
  </>;
}
