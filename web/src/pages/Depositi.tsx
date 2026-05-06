import { useCallback, useEffect, useState } from 'react';
import { getList, api, ApiError, type Deposito } from '../api';
import { DepositoFormModal } from '../components/DepositoFormModal';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { Pager } from '../components/Pager';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export function DepositiPage() {
  const [depositi, setDepositi] = useState<Deposito[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const confirm = useConfirm();
  const { push } = useToast();

  const debouncedQ = useDebouncedValue(q, 250);

  const fetchDepositi = useCallback(async (query: string, off: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(off));
    setLoading(true);
    try {
      const { rows, total } = await getList<Deposito>(`/api/depositi?${params}`);
      setDepositi(rows);
      setTotal(total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setOffset(0); }, [debouncedQ]);
  useEffect(() => { void fetchDepositi(debouncedQ, offset); }, [debouncedQ, offset, fetchDepositi]);

  async function handleDelete(d: Deposito) {
    if (d.n_materiali && d.n_materiali > 0) {
      push(`Impossibile eliminare: il deposito contiene ${d.n_materiali} materiali attivi.`, 'error');
      return;
    }
    const ok = await confirm({
      title: `Eliminare il deposito "${d.nome}"`,
      message: `Procedere con l'eliminazione?`,
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/depositi/${d.id}`);
      push('Deposito eliminato', 'success');
      void fetchDepositi(debouncedQ, offset);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Depositi</h1>
        <button type="button" onClick={() => setShowCreate(true)}>Nuovo deposito</button>
      </header>

      <div className="filters">
        <input
          type="search"
          placeholder="Cerca per nome o descrizione…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrizione</th>
                <th>Materiali</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {depositi.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.nome}</strong></td>
                  <td>{d.descrizione ?? <span className="muted">—</span>}</td>
                  <td>{d.n_materiali ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn-link" onClick={() => setEditing(d)}>
                      Modifica
                    </button>
                    {' · '}
                    <button type="button" className="btn-link" onClick={() => void handleDelete(d)}>
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
              {depositi.length === 0 && (
                <tr><td colSpan={4} className="muted">Nessun deposito</td></tr>
              )}
            </tbody>
          </table>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <DepositoFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchDepositi(debouncedQ, offset)}
      />
      <DepositoFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        onSaved={() => void fetchDepositi(debouncedQ, offset)}
        deposito={editing}
      />
    </div>
  );
}
