import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getList, type Dottore } from '../api';
import { DottoreFormModal } from '../components/DottoreFormModal';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export function DottoriPage() {
  const [searchParams] = useSearchParams();
  const [dottori, setDottori] = useState<Dottore[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Dottore | null>(null);

  const debouncedQ = useDebouncedValue(q, 250);

  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
  }, [searchParams]);

  const fetchDottori = useCallback(async (query: string, off: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(off));
    setLoading(true);
    try {
      const { rows, total } = await getList<Dottore>(`/api/dottori?${params}`);
      setDottori(rows);
      setTotal(total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setOffset(0); }, [debouncedQ]);
  useEffect(() => { void fetchDottori(debouncedQ, offset); }, [debouncedQ, offset, fetchDottori]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dottori</h1>
        <div className="page-actions">
          <ExportCsvButton
            path="/api/dottori/csv"
            params={(() => {
              const p = new URLSearchParams();
              if (debouncedQ) p.set('q', debouncedQ);
              return p;
            })()}
          />
          <button type="button" onClick={() => setShowCreate(true)}>Nuovo dottore</button>
        </div>
      </header>

      <div className="filters">
        <input
          type="search"
          placeholder="Cerca per nome o studio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <table className="table table--clickable">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Studio</th>
                <th>Telefono</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {dottori.map((d) => (
                <tr key={d.id} onClick={() => setEditing(d)}>
                  <td><strong>{d.nome}</strong></td>
                  <td>{d.studio ?? <span className="muted">—</span>}</td>
                  <td>{d.telefono ?? <span className="muted">—</span>}</td>
                  <td>{d.email ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
              {dottori.length === 0 && (
                <tr><td colSpan={4} className="muted">Nessun dottore</td></tr>
              )}
            </tbody>
          </table>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <DottoreFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchDottori(debouncedQ, offset)}
      />
      <DottoreFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        onSaved={() => void fetchDottori(debouncedQ, offset)}
        dottore={editing}
      />
    </div>
  );
}
