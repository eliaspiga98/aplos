import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getList, type Macchinario } from '../api';
import { formatDate } from '../utils/format';
import { MacchinarioFormModal } from '../components/MacchinarioFormModal';
import { MacchinarioDetailModal } from '../components/MacchinarioDetailModal';
import { Pager } from '../components/Pager';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export function MacchinariPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Macchinario[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const debouncedQ = useDebouncedValue(q, 250);
  const openRaw = Number(searchParams.get('open'));
  const openId = Number.isInteger(openRaw) && openRaw > 0 ? openRaw : null;
  const setOpenId = (id: number | null) => setSearchParams((current) => {
    const next = new URLSearchParams(current); if (id) next.set('open', String(id)); else next.delete('open'); return next;
  }, { replace: true });

  const load = useCallback(async (query: string, off: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) }); if (query) params.set('q', query);
    setLoading(true); try { const result = await getList<Macchinario>(`/api/macchinari?${params}`); setRows(result.rows); setTotal(result.total); } finally { setLoading(false); }
  }, []);
  useEffect(() => { setOffset(0); }, [debouncedQ]);
  useEffect(() => { void load(debouncedQ, offset); }, [debouncedQ, offset, load]);

  return <div className="page">
    <header className="page-header"><h1>Macchinari</h1><button type="button" onClick={() => setShowCreate(true)}>Nuovo macchinario</button></header>
    <div className="filters"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, marca, modello o matricola…" /></div>
    {loading ? <p>Caricamento…</p> : <><table className="table table--clickable"><thead><tr><th>Macchinario</th><th>Marca / modello</th><th>Ubicazione</th><th>Manutenzioni</th><th>Prossima scadenza</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} onClick={() => setOpenId(row.id)}><td><strong>{row.nome}</strong></td><td>{[row.marca, row.modello].filter(Boolean).join(' ') || '—'}</td><td>{row.ubicazione ?? '—'}</td><td>{row.manutenzioni_attive ?? 0}</td><td>{formatDate(row.prossima_manutenzione)}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={5} className="muted">Nessun macchinario</td></tr>}
    </tbody></table><Pager total={total} offset={offset} limit={PAGE_SIZE} onChange={setOffset} /></>}
    <MacchinarioFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={(machine) => { void load(debouncedQ, offset); setOpenId(machine.id); }} />
    <MacchinarioDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={() => void load(debouncedQ, offset)} />
  </div>;
}
