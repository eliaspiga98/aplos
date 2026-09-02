import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getList, type Lavoro, type StatoLavoro } from '../api';
import { LavoroFormModal } from '../components/LavoroFormModal';
import { LavoroDetailModal } from '../components/LavoroDetailModal';
import { StatoLavoroSelect } from '../components/StatoLavoroSelect';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { LavoriKanban } from '../components/LavoriKanban';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatDate } from '../utils/format';
import { useAuth } from '../auth';

const PAGE_SIZE = 50;

export function LavoriPage() {
  const { user } = useAuth();
  const viewKey = user?.id ? `aplos:lavori-view:${user.id}` : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [stato, setStato] = useState<string>(searchParams.get('stato') ?? '');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  // Vista: priorità query string > preferenza salvata per l'utente > default kanban
  const [view, setView] = useState<'tabella' | 'kanban'>(() => {
    const fromUrl = searchParams.get('view');
    if (fromUrl === 'tabella' || fromUrl === 'kanban') return fromUrl;
    if (viewKey) {
      const saved = localStorage.getItem(viewKey);
      if (saved === 'tabella' || saved === 'kanban') return saved;
    }
    return 'kanban';
  });

  // Persisti la vista per l'utente
  useEffect(() => {
    if (viewKey) localStorage.setItem(viewKey, view);
  }, [view, viewKey]);
  const openParam = Number(searchParams.get('open'));
  const openId = Number.isInteger(openParam) && openParam > 0 ? openParam : null;

  const setOpenId = useCallback((id: number | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id != null) next.set('open', String(id));
      else next.delete('open');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const debouncedQ = useDebouncedValue(q, 250);

  const fetchLavori = useCallback(async (
    query: string,
    statoFilter: string,
    off: number,
    useView: 'tabella' | 'kanban',
  ) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (statoFilter) params.set('stato', statoFilter);
    // In Kanban prendiamo molti più lavori (devono entrare tutti nelle 4
    // colonne); in tabella usiamo la paginazione standard.
    params.set('limit', useView === 'kanban' ? '500' : String(PAGE_SIZE));
    params.set('offset', useView === 'kanban' ? '0' : String(off));
    setLoading(true);
    try {
      const { rows, total } = await getList<Lavoro>(`/api/lavori?${params}`);
      setLavori(rows);
      setTotal(total);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset offset quando cambiano i filtri (non quando cambia solo offset).
  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, stato]);

  useEffect(() => {
    void fetchLavori(debouncedQ, stato, offset, view);
  }, [debouncedQ, stato, offset, fetchLavori, view]);

  function applyStato(id: number, next: StatoLavoro) {
    setLavori((curr) => curr.map((l) => (l.id === id ? { ...l, stato: next } : l)));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Lavori</h1>
        <div className="page-actions">
          <ExportCsvButton
            path="/api/lavori/csv"
            params={(() => {
              const p = new URLSearchParams();
              if (debouncedQ) p.set('q', debouncedQ);
              if (stato) p.set('stato', stato);
              return p;
            })()}
          />
          <button type="button" onClick={() => setShowCreate(true)}>Nuovo lavoro</button>
        </div>
      </header>

      <div className="filters">
        <div className="view-switch">
          <button
            type="button"
            className={view === 'tabella' ? 'view-switch-btn view-switch-btn--active' : 'view-switch-btn'}
            onClick={() => setView('tabella')}
          >
            Tabella
          </button>
          <button
            type="button"
            className={view === 'kanban' ? 'view-switch-btn view-switch-btn--active' : 'view-switch-btn'}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
        </div>
        <input
          type="search"
          placeholder="Cerca paziente, dottore o ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {view === 'tabella' && (
          <select value={stato} onChange={(e) => setStato(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="in_attesa">In attesa</option>
            <option value="in_corso">In corso</option>
            <option value="in_prova">In prova</option>
            <option value="finito">Finito</option>
          </select>
        )}
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : view === 'kanban' ? (
        <LavoriKanban
          lavori={lavori}
          onChange={setLavori}
          onOpen={(id) => setOpenId(id)}
          onRefresh={() => void fetchLavori(debouncedQ, stato, offset, view)}
        />
      ) : (
        <>
          <table className="table table--clickable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Paziente</th>
                <th>Dottore</th>
                <th>Collaboratori</th>
                <th>Entrata</th>
                <th>Consegna</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {lavori.map((l) => (
                <tr key={l.id} onClick={() => setOpenId(l.id)}>
                  <td>#{l.id}</td>
                  <td>{l.nome_paziente}</td>
                  <td>
                    {l.dottore_nome}
                    {l.dottore_studio ? <span className="muted"> — {l.dottore_studio}</span> : null}
                  </td>
                  <td>{l.assegnazioni.length > 0
                    ? l.assegnazioni.map((a) => `${a.collaboratore_nome} (${a.mansione})`).join(', ')
                    : <span className="muted">—</span>}
                  </td>
                  <td>{formatDate(l.data_entrata)}</td>
                  <td>{formatDate(l.data_consegna)}</td>
                  <td>
                    <StatoLavoroSelect
                      idLavoro={l.id}
                      stato={l.stato}
                      assegnazioni={l.assegnazioni}
                      onChange={(next) => {
                        applyStato(l.id, next);
                        void fetchLavori(debouncedQ, stato, offset, view);
                      }}
                    />
                  </td>
                </tr>
              ))}
              {lavori.length === 0 && (
                <tr><td colSpan={7} className="muted">Nessun lavoro</td></tr>
              )}
            </tbody>
          </table>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <LavoroFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchLavori(debouncedQ, stato, offset, view)}
      />
      <LavoroDetailModal
        idLavoro={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => void fetchLavori(debouncedQ, stato, offset, view)}
      />
    </div>
  );
}
