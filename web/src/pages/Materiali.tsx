import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getList, type Materiale, type StatoUtilizzo } from '../api';
import { MaterialeFormModal } from '../components/MaterialeFormModal';
import { StatoUtilizzoSelect } from '../components/StatoUtilizzoSelect';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { labelCategoria, CATEGORIA_LABEL } from '../utils/format';

const CATEGORIE = ['zirconio', 'pmma', 'resina', 'metallo', 'ceramica', 'altro'] as const;
const PAGE_SIZE = 50;

export function MaterialiPage() {
  const [searchParams] = useSearchParams();
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [total, setTotal] = useState(0);
  const [categoria, setCategoria] = useState<string>(searchParams.get('categoria') ?? '');
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const debouncedQ = useDebouncedValue(q, 250);

  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setCategoria(searchParams.get('categoria') ?? '');
  }, [searchParams]);

  const fetchMateriali = useCallback(async (cat: string, query: string, off: number) => {
    const params = new URLSearchParams();
    if (cat) params.set('categoria', cat);
    if (query) params.set('q', query);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(off));
    setLoading(true);
    try {
      const { rows, total } = await getList<Materiale>(`/api/materiali?${params}`);
      setMateriali(rows);
      setTotal(total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, categoria]);

  useEffect(() => {
    void fetchMateriali(categoria, debouncedQ, offset);
  }, [categoria, debouncedQ, offset, fetchMateriali]);

  function applyStato(id: number, next: StatoUtilizzo) {
    setMateriali((curr) => curr.map((m) => (m.id === id ? { ...m, stato_utilizzo: next } : m)));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Magazzino</h1>
        <div className="page-actions">
          <ExportCsvButton
            path="/api/materiali/csv"
            params={(() => {
              const p = new URLSearchParams();
              if (categoria) p.set('categoria', categoria);
              if (debouncedQ) p.set('q', debouncedQ);
              return p;
            })()}
          />
          <button type="button" onClick={() => setShowCreate(true)}>Nuovo materiale</button>
        </div>
      </header>

      <div className="filters">
        <input
          type="search"
          placeholder="Cerca lotto, marca, colore…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
        </select>
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Marca</th>
                <th>Colore</th>
                <th>Lotto</th>
                <th>Deposito</th>
                <th>Dim. (mm) / Quantità</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {materiali.map((m) => (
                <tr key={m.id}>
                  <td>{labelCategoria(m.categoria)}</td>
                  <td>{m.marca ?? <span className="muted">—</span>}</td>
                  <td>{m.colore ?? <span className="muted">—</span>}</td>
                  <td>{m.lotto}</td>
                  <td>{m.deposito_nome ?? <span className="muted">—</span>}</td>
                  <td>
                    {m.altezza_mm && m.larghezza_mm
                      ? `${m.altezza_mm} × ${m.larghezza_mm}`
                      : m.quantita
                        ? `${m.quantita}${m.unita_misura ? ' ' + m.unita_misura : ''}`
                        : <span className="muted">—</span>}
                  </td>
                  <td>
                    <StatoUtilizzoSelect
                      idMateriale={m.id}
                      stato={m.stato_utilizzo}
                      onChange={(next) => applyStato(m.id, next)}
                    />
                  </td>
                </tr>
              ))}
              {materiali.length === 0 && (
                <tr><td colSpan={7} className="muted">Nessun materiale</td></tr>
              )}
            </tbody>
          </table>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <MaterialeFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void fetchMateriali(categoria, debouncedQ, offset)}
      />
    </div>
  );
}
