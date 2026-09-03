import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, getList, type Lavoro, type StatoLavoro } from '../api';
import { LavoroFormModal } from '../components/LavoroFormModal';
import { LavoroDetailModal } from '../components/LavoroDetailModal';
import { StatoLavoroSelect } from '../components/StatoLavoroSelect';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { LavoriKanban } from '../components/LavoriKanban';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatDate, formatDateTime, labelStatoLavoro } from '../utils/format';
import { useAuth } from '../auth';

const PAGE_SIZE = 50;
const STATI: StatoLavoro[] = [
  'in_attesa', 'in_corso_cad', 'attesa_rifinitura',
  'in_corso_rifinitura', 'in_prova', 'finito',
];

interface ArchiveConfig {
  giorni: number;
  lavori_archiviati: number;
}

export function LavoriPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const viewKey = user?.id ? `aplos:lavori-view:${user.id}` : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [stato, setStato] = useState<string>(searchParams.get('stato') ?? '');
  const [archivio, setArchivio] = useState(searchParams.get('archivio') === '1');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [archiveConfig, setArchiveConfig] = useState<ArchiveConfig | null>(null);
  const [archiveDays, setArchiveDays] = useState('15');
  const [savingArchiveDays, setSavingArchiveDays] = useState(false);
  const [view, setView] = useState<'tabella' | 'kanban'>(() => {
    const fromUrl = searchParams.get('view');
    if (fromUrl === 'tabella' || fromUrl === 'kanban') return fromUrl;
    if (viewKey) {
      const saved = localStorage.getItem(viewKey);
      if (saved === 'tabella' || saved === 'kanban') return saved;
    }
    return 'kanban';
  });

  const effectiveView = archivio ? 'tabella' : view;
  const debouncedQ = useDebouncedValue(q, 250);
  const openParam = Number(searchParams.get('open'));
  const openId = Number.isInteger(openParam) && openParam > 0 ? openParam : null;

  useEffect(() => {
    if (viewKey) localStorage.setItem(viewKey, view);
  }, [view, viewKey]);

  const setOpenId = useCallback((id: number | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id != null) next.set('open', String(id));
      else next.delete('open');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const fetchArchiveConfig = useCallback(async () => {
    try {
      const config = await api.get<ArchiveConfig>('/api/lavori/archivio-config');
      setArchiveConfig(config);
      setArchiveDays(String(config.giorni));
    } catch {
      setArchiveConfig(null);
    }
  }, []);

  const fetchLavori = useCallback(async (
    query: string,
    statoFilter: string,
    off: number,
    useView: 'tabella' | 'kanban',
    archived: boolean,
  ) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (statoFilter) params.set('stato', statoFilter);
    if (archived) params.set('archivio', 'true');
    params.set('limit', useView === 'kanban' ? '500' : String(PAGE_SIZE));
    params.set('offset', useView === 'kanban' ? '0' : String(off));
    setLoading(true);
    try {
      const result = await getList<Lavoro>(`/api/lavori?${params}`);
      setLavori(result.rows);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArchiveConfig();
  }, [fetchArchiveConfig]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, stato, archivio]);

  useEffect(() => {
    void fetchLavori(debouncedQ, stato, offset, effectiveView, archivio);
  }, [debouncedQ, stato, offset, fetchLavori, effectiveView, archivio]);

  function switchArchive(next: boolean) {
    setArchivio(next);
    setStato(next ? 'finito' : '');
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next) params.set('archivio', '1');
      else params.delete('archivio');
      params.delete('stato');
      params.delete('open');
      return params;
    }, { replace: true });
  }

  function refresh() {
    void fetchLavori(debouncedQ, stato, offset, effectiveView, archivio);
    void fetchArchiveConfig();
  }

  async function saveArchiveDays(e: React.FormEvent) {
    e.preventDefault();
    const giorni = Number(archiveDays);
    if (!Number.isInteger(giorni) || giorni < 0 || giorni > 365) {
      push('Inserisci un numero di giorni compreso tra 0 e 365.', 'error');
      return;
    }
    setSavingArchiveDays(true);
    try {
      await api.put('/api/lavori/archivio-config', { giorni });
      push(giorni === 0 ? 'Archiviazione automatica disattivata' : `Archiviazione automatica impostata a ${giorni} giorni`, 'success');
      refresh();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    } finally {
      setSavingArchiveDays(false);
    }
  }

  function applyStato(id: number, next: StatoLavoro) {
    setLavori((current) => current.map((lavoro) => lavoro.id === id ? { ...lavoro, stato: next } : lavoro));
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{archivio ? 'Archivio lavori' : 'Lavori'}</h1>
          {archivio && <p className="page-subtitle">I lavori archiviati restano sempre recuperabili.</p>}
        </div>
        <div className="page-actions">
          <ExportCsvButton
            path="/api/lavori/csv"
            params={(() => {
              const params = new URLSearchParams();
              if (debouncedQ) params.set('q', debouncedQ);
              if (stato) params.set('stato', stato);
              if (archivio) params.set('archivio', 'true');
              return params;
            })()}
          />
          {!archivio && <button type="button" onClick={() => setShowCreate(true)}>Nuovo lavoro</button>}
        </div>
      </header>

      <div className="workflow-scope-switch" aria-label="Ambito lavori">
        <button type="button" className={!archivio ? 'active' : ''} onClick={() => switchArchive(false)}>
          Lavori attivi
        </button>
        <button type="button" className={archivio ? 'active' : ''} onClick={() => switchArchive(true)}>
          Archivio{archiveConfig ? ` (${archiveConfig.lavori_archiviati})` : ''}
        </button>
      </div>

      {!archivio && user?.ruolo === 'admin' && archiveConfig && (
        <form className="archive-settings" onSubmit={saveArchiveDays}>
          <div>
            <strong>Archiviazione automatica</strong>
            <span>I lavori finiti vengono archiviati dopo il periodo scelto. Usa 0 per disattivarla.</span>
          </div>
          <label>
            Giorni
            <input type="number" min="0" max="365" value={archiveDays} onChange={(e) => setArchiveDays(e.target.value)} />
          </label>
          <button type="submit" className="btn-secondary" disabled={savingArchiveDays}>
            {savingArchiveDays ? 'Salvataggio…' : 'Salva'}
          </button>
        </form>
      )}

      <div className="filters">
        {!archivio && <div className="view-switch">
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
        </div>}
        <input
          type="search"
          placeholder="Cerca paziente, dottore o ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {effectiveView === 'tabella' && !archivio && (
          <select value={stato} onChange={(e) => setStato(e.target.value)}>
            <option value="">Tutte le fasi</option>
            {STATI.map((value) => <option key={value} value={value}>{labelStatoLavoro(value)}</option>)}
          </select>
        )}
      </div>

      {loading ? <p>Caricamento…</p> : effectiveView === 'kanban' ? (
        <LavoriKanban
          lavori={lavori}
          onChange={setLavori}
          onOpen={setOpenId}
          onRefresh={refresh}
        />
      ) : <>
        <table className="table table--clickable">
          <thead>
            <tr>
              <th>ID</th><th>Paziente</th><th>Dottore</th><th>Collaboratori</th>
              <th>Entrata</th><th>Consegna</th><th>{archivio ? 'Archiviato il' : 'Fase'}</th>
            </tr>
          </thead>
          <tbody>
            {lavori.map((lavoro) => (
              <tr key={lavoro.id} onClick={() => setOpenId(lavoro.id)}>
                <td>#{lavoro.id}</td>
                <td>{lavoro.nome_paziente}</td>
                <td>
                  {lavoro.dottore_nome}
                  {lavoro.dottore_studio ? <span className="muted"> — {lavoro.dottore_studio}</span> : null}
                </td>
                <td>{lavoro.assegnazioni.length > 0
                  ? lavoro.assegnazioni.map((assignment) => (
                    <span className={`assignment-chip assignment-chip--${assignment.stato_incarico}`} key={assignment.id}>
                      {assignment.collaboratore_nome}
                    </span>
                  ))
                  : <span className="muted">—</span>}
                </td>
                <td>{formatDate(lavoro.data_entrata)}</td>
                <td>{formatDate(lavoro.data_consegna)}</td>
                <td>{archivio ? formatDateTime(lavoro.archiviato_at) : (
                  <StatoLavoroSelect
                    idLavoro={lavoro.id}
                    stato={lavoro.stato}
                    assegnazioni={lavoro.assegnazioni}
                    onChange={(next) => {
                      applyStato(lavoro.id, next);
                      refresh();
                    }}
                  />
                )}</td>
              </tr>
            ))}
            {lavori.length === 0 && <tr><td colSpan={7} className="muted">
              {archivio ? 'Nessun lavoro archiviato' : 'Nessun lavoro'}
            </td></tr>}
          </tbody>
        </table>
        <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
      </>}

      <LavoroFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={refresh}
      />
      <LavoroDetailModal
        idLavoro={openId}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
      />
    </div>
  );
}
