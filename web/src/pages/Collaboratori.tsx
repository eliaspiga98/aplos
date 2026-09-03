import { useCallback, useEffect, useState } from 'react';
import {
  getList, api, ApiError,
  type Collaboratore, type StatisticheCollaboratori,
} from '../api';
import { CollaboratoreFormModal } from '../components/CollaboratoreFormModal';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { Pager } from '../components/Pager';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

function currentMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function CollaboratoriPage() {
  const [rows, setRows] = useState<Collaboratore[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Collaboratore | null>(null);
  const [mese, setMese] = useState(currentMonth);
  const [stats, setStats] = useState<StatisticheCollaboratori | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const debouncedQ = useDebouncedValue(q, 250);
  const confirm = useConfirm();
  const { push } = useToast();

  const fetchRows = useCallback(async (query: string, off: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
    if (query) params.set('q', query);
    setLoading(true);
    try {
      const result = await getList<Collaboratore>(`/api/collaboratori?${params}`);
      setRows(result.rows);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setOffset(0); }, [debouncedQ]);
  useEffect(() => { void fetchRows(debouncedQ, offset); }, [debouncedQ, offset, fetchRows]);
  useEffect(() => {
    setStatsLoading(true);
    api.get<StatisticheCollaboratori>(`/api/collaboratori/statistiche?mese=${mese}`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [mese]);

  async function remove(row: Collaboratore) {
    const ok = await confirm({
      title: `Archiviare il collaboratore "${row.nome}"`,
      message: 'Le assegnazioni storiche rimarranno associate ai lavori.',
      confirmText: 'Archivia',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/collaboratori/${row.id}`);
      push('Collaboratore archiviato', 'success');
      void fetchRows(debouncedQ, offset);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Collaboratori</h1>
        <div className="page-actions">
          <ExportCsvButton path="/api/collaboratori/csv" />
          <button type="button" onClick={() => setShowCreate(true)}>Nuovo collaboratore</button>
        </div>
      </header>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o mansione…" />
      </div>

      <section className="collaborator-report">
        <header className="collaborator-report-header">
          <div>
            <h2>Riepilogo lavorazioni</h2>
            <p className="muted">Conta i lavori completati da ogni collaboratore nel mese selezionato.</p>
          </div>
          <label>
            Mese
            <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} />
          </label>
        </header>
        {statsLoading ? <p>Caricamento riepilogo…</p> : stats && <div className="collaborator-report-grid">
          <div>
            <table className="table table--compact">
              <thead><tr><th>Collaboratore</th><th>CAD</th><th>Rifinitura</th><th>Altro</th><th>Totale</th></tr></thead>
              <tbody>
                {stats.collaboratori.map((row) => <tr key={row.id}>
                  <td><strong>{row.nome}</strong></td>
                  <td>{row.lavori_cad}</td>
                  <td>{row.lavori_rifinitura}</td>
                  <td>{row.lavori_altro}</td>
                  <td><strong>{row.lavori_totali}</strong></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <aside className="collaboration-pairs">
            <h3>Lavori svolti insieme</h3>
            {stats.coppie.length === 0 ? <p className="muted">Nessuna collaborazione completata nel mese.</p> : (
              <ul>{stats.coppie.map((pair) => <li key={`${pair.id_primo}-${pair.id_secondo}`}>
                <span>{pair.primo} + {pair.secondo}</span>
                <strong>{pair.lavori_insieme}</strong>
              </li>)}</ul>
            )}
          </aside>
        </div>}
      </section>

      {loading ? <p>Caricamento…</p> : <>
        <table className="table">
          <thead><tr><th>Nome</th><th>Mansioni</th><th>Contatti</th><th>Lavori assegnati</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <td><strong>{row.nome}</strong></td>
              <td>{row.mansioni ?? <span className="muted">—</span>}</td>
              <td>{row.telefono ?? row.email ?? <span className="muted">—</span>}</td>
              <td>{row.lavori_attivi ?? 0}</td>
              <td style={{ textAlign: 'right' }}>
                <button type="button" className="btn-link" onClick={() => setEditing(row)}>Modifica</button>{' · '}
                <button type="button" className="btn-link" onClick={() => void remove(row)}>Archivia</button>
              </td>
            </tr>)}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Nessun collaboratore</td></tr>}
          </tbody>
        </table>
        <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
      </>}
      <CollaboratoreFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => void fetchRows(debouncedQ, offset)} />
      <CollaboratoreFormModal open={editing != null} onClose={() => setEditing(null)} onSaved={() => void fetchRows(debouncedQ, offset)} collaboratore={editing} />
    </div>
  );
}
