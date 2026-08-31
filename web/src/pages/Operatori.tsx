import { useCallback, useEffect, useState } from 'react';
import { api, type Operatore } from '../api';
import { OperatoreFormModal } from '../components/OperatoreFormModal';
import { useAuth } from '../auth';
import { formatDate, labelRuolo } from '../utils/format';

export function OperatoriPage() {
  const { user } = useAuth();
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Operatore | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      setOperatori(await api.get<Operatore[]>('/api/operatori'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  if (user?.ruolo !== 'admin') {
    return (
      <div className="page">
        <h1>Operatori</h1>
        <p className="muted">Pagina riservata agli amministratori.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Operatori</h1>
        <button type="button" onClick={() => setShowCreate(true)}>Nuovo operatore</button>
      </header>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <table className="table table--clickable">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th>Lingua</th>
              <th>Account demo</th>
              <th>Creato</th>
            </tr>
          </thead>
          <tbody>
            {operatori.map((o) => (
              <tr key={o.id} onClick={() => setEditing(o)}>
                <td><strong>{o.nome}</strong></td>
                <td>
                  <span className={`pill pill--${o.ruolo}`}>{labelRuolo(o.ruolo)}</span>
                </td>
                <td>{o.lingua === 'en' ? 'English' : 'Italiano'}</td>
                <td>
                  {o.usa_demo
                    ? <span className="badge-demo">DEMO</span>
                    : <span className="muted">—</span>}
                </td>
                <td>{formatDate(o.created_at)}</td>
              </tr>
            ))}
            {operatori.length === 0 && (
              <tr><td colSpan={5} className="muted">Nessun operatore</td></tr>
            )}
          </tbody>
        </table>
      )}

      <OperatoreFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => void fetchAll()}
      />
      <OperatoreFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        onSaved={() => void fetchAll()}
        operatore={editing}
      />
    </div>
  );
}
