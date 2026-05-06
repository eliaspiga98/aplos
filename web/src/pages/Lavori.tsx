import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getList, type Lavoro, type StatoLavoro } from '../api';
import { LavoroFormModal } from '../components/LavoroFormModal';
import { LavoroDetailModal } from '../components/LavoroDetailModal';
import { StatoLavoroSelect } from '../components/StatoLavoroSelect';
import { Pager } from '../components/Pager';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export function LavoriPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [stato, setStato] = useState<string>(searchParams.get('stato') ?? '');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<number | null>(() => {
    const v = searchParams.get('open');
    return v ? Number(v) : null;
  });

  const debouncedQ = useDebouncedValue(q, 250);

  // Sincronizza ?open=<id> nell'URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (openId != null) next.set('open', String(openId));
    else next.delete('open');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [openId, searchParams, setSearchParams]);

  useEffect(() => {
    const v = searchParams.get('open');
    setOpenId(v ? Number(v) : null);
  }, [searchParams]);

  const fetchLavori = useCallback(async (query: string, statoFilter: string, off: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (statoFilter) params.set('stato', statoFilter);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(off));
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
    void fetchLavori(debouncedQ, stato, offset);
  }, [debouncedQ, stato, offset, fetchLavori]);

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
        <input
          type="search"
          placeholder="Cerca paziente, dottore o ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={stato} onChange={(e) => setStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="in_attesa">In attesa</option>
          <option value="in_corso">In corso</option>
          <option value="in_prova">In prova</option>
          <option value="finito">Finito</option>
        </select>
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <table className="table table--clickable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Paziente</th>
                <th>Dottore</th>
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
                  <td>{l.data_entrata}</td>
                  <td>{l.data_consegna}</td>
                  <td>
                    <StatoLavoroSelect
                      idLavoro={l.id}
                      stato={l.stato}
                      onChange={(next) => applyStato(l.id, next)}
                    />
                  </td>
                </tr>
              ))}
              {lavori.length === 0 && (
                <tr><td colSpan={6} className="muted">Nessun lavoro</td></tr>
              )}
            </tbody>
          </table>
          <Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} />
        </>
      )}

      <LavoroFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchLavori(debouncedQ, stato, offset)}
      />
      <LavoroDetailModal
        idLavoro={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => void fetchLavori(debouncedQ, stato, offset)}
      />
    </div>
  );
}
