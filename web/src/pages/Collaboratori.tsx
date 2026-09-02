import { useCallback, useEffect, useState } from 'react';
import { getList, api, ApiError, type Collaboratore } from '../api';
import { CollaboratoreFormModal } from '../components/CollaboratoreFormModal';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { Pager } from '../components/Pager';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export function CollaboratoriPage() {
  const [rows, setRows] = useState<Collaboratore[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Collaboratore | null>(null);
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
