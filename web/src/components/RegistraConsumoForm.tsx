import { useEffect, useState } from 'react';
import { api, ApiError, type Materiale } from '../api';
import { labelCategoria } from '../utils/format';

interface Props {
  idLavoro: number;
  onCancel: () => void;
  onSaved: () => void;
}

const initial = {
  id_materiale: '' as string | number,
  quantita_usata: '',
  unita_misura: '',
  note: '',
};

export function RegistraConsumoForm({ idLavoro, onCancel, onSaved }: Props) {
  const [form, setForm] = useState(initial);
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Materiale[]>('/api/materiali?limit=500')
      .then((rows) => setMateriali(rows.filter((m) => m.stato_utilizzo !== 'esaurito')))
      .catch(() => setMateriali([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id_materiale) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/lavori/${idLavoro}/materiali`, {
        id_materiale: Number(form.id_materiale),
        quantita_usata: form.quantita_usata ? Number(form.quantita_usata) : undefined,
        unita_misura: form.unita_misura.trim() || undefined,
        note: form.note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      <div className="form-grid form-grid--2">
        <label>
          Materiale*
          <select
            value={form.id_materiale}
            onChange={(e) => setForm({ ...form, id_materiale: e.target.value })}
            required
          >
            <option value="">— seleziona —</option>
            {materiali.map((m) => (
              <option key={m.id} value={m.id}>
                {labelCategoria(m.categoria)} {m.marca ?? ''} {m.colore ?? ''} — lotto {m.lotto}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantità
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.quantita_usata}
            onChange={(e) => setForm({ ...form, quantita_usata: e.target.value })}
          />
        </label>
      </div>
      <div className="form-grid form-grid--2">
        <label>
          Unità misura
          <input
            placeholder="es. mg, ml, pz"
            value={form.unita_misura}
            onChange={(e) => setForm({ ...form, unita_misura: e.target.value })}
          />
        </label>
        <label>
          Note
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="inline-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Annulla</button>
        <button type="submit" disabled={busy || !form.id_materiale}>
          {busy ? 'Salvataggio…' : 'Registra consumo'}
        </button>
      </div>
    </form>
  );
}
