import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, getList, type Materiale } from '../api';
import { MaterialeFormModal } from '../components/MaterialeFormModal';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { labelCategoria, CATEGORIA_LABEL, STATO_UTILIZZO_LABEL } from '../utils/format';

const CATEGORIE = ['zirconio', 'pmma', 'resina', 'metallo', 'ceramica', 'altro'] as const;
const PAGE_SIZE = 50;

function quantity(value: string, unit: string | null): string {
  const parsed = Number(value);
  return `${parsed.toLocaleString('it-IT', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;
}

export function MaterialiPage() {
  const [searchParams] = useSearchParams();
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [total, setTotal] = useState(0);
  const [categoria, setCategoria] = useState<string>(searchParams.get('categoria') ?? '');
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Materiale | null>(null);
  const confirm = useConfirm();
  const { push } = useToast();

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

  async function archive(materiale: Materiale) {
    const ok = await confirm({
      title: `Archiviare il materiale del lotto ${materiale.lotto}`,
      message: 'Il materiale sparirà dal magazzino, ma gli utilizzi già associati ai lavori resteranno nello storico.',
      confirmText: 'Archivia',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/materiali/${materiale.id}`);
      push(`Materiale lotto ${materiale.lotto} archiviato`, 'success');
      void fetchMateriali(categoria, debouncedQ, offset);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Impossibile archiviare il materiale', 'error');
    }
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
          <div className="table-scroll">
            <table className="table material-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Marca</th>
                  <th>Colore</th>
                  <th>Lotto</th>
                  <th>Deposito</th>
                  <th>Misura</th>
                  <th>Disponibilità</th>
                  <th>Stato</th>
                  <th>Azioni</th>
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
                    <td>{m.altezza_mm && m.larghezza_mm
                      ? `${m.altezza_mm} × ${m.larghezza_mm} mm`
                      : <span className="muted">—</span>}</td>
                    <td>
                      <div className="stock-breakdown">
                        <span className="stock-chip stock-chip--new">Nuovi {quantity(m.quantita, m.unita_misura)}</span>
                        <span className="stock-chip stock-chip--partial">Parziali {quantity(m.quantita_parziale, m.unita_misura)}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`stock-state stock-state--${m.stato_utilizzo}`}>
                        {STATO_UTILIZZO_LABEL[m.stato_utilizzo]}
                      </span>
                    </td>
                    <td className="material-actions">
                      <button type="button" className="btn-link" onClick={() => setEditing(m)}>Modifica</button>
                      <button type="button" className="btn-link btn-link--danger" onClick={() => void archive(m)}>Archivia</button>
                    </td>
                  </tr>
                ))}
                {materiali.length === 0 && (
                  <tr><td colSpan={9} className="muted">Nessun materiale</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <MaterialeFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchMateriali(categoria, debouncedQ, offset)}
      />
      <MaterialeFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void fetchMateriali(categoria, debouncedQ, offset);
        }}
        materiale={editing}
      />
    </div>
  );
}
