import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { api, ApiError, type CategoriaMateriale, type Deposito, type Materiale, type StatoUtilizzo } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (m: Materiale) => void;
}

const CATEGORIE: CategoriaMateriale[] = ['zirconio', 'pmma', 'resina', 'metallo', 'ceramica', 'altro'];
const STATI: StatoUtilizzo[] = ['nuovo', 'parziale', 'esaurito'];

// Per zirconio e PMMA il formato standard è la "cialda" (disco) da fresatura,
// quindi mostriamo i campi dimensionali. Per le altre categorie si usa una
// quantità con unità di misura libera.
function isCialda(cat: CategoriaMateriale): boolean {
  return cat === 'zirconio' || cat === 'pmma';
}

const initial = {
  categoria: 'zirconio' as CategoriaMateriale,
  sottotipo: '',
  marca: '',
  colore: '',
  lotto: '',
  id_deposito: '' as string | number,
  altezza_mm: '',
  larghezza_mm: '',
  quantita: '',
  unita_misura: '',
  stato_utilizzo: 'nuovo' as StatoUtilizzo,
  soglia_alert: '',
};

export function MaterialeFormModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(initial);
  const [depositi, setDepositi] = useState<Deposito[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    api.get<Deposito[]>('/api/depositi?limit=200').then(setDepositi).catch(() => setDepositi([]));
  }, [open]);

  function reset() {
    setForm(initial);
    setError(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        categoria: form.categoria,
        sottotipo: form.sottotipo.trim() || null,
        marca: form.marca.trim() || null,
        colore: form.colore.trim() || null,
        lotto: form.lotto.trim(),
        id_deposito: form.id_deposito ? Number(form.id_deposito) : null,
        stato_utilizzo: form.stato_utilizzo,
        soglia_alert: form.soglia_alert ? Number(form.soglia_alert) : null,
      };
      if (isCialda(form.categoria)) {
        payload.altezza_mm = form.altezza_mm ? Number(form.altezza_mm) : null;
        payload.larghezza_mm = form.larghezza_mm ? Number(form.larghezza_mm) : null;
      } else {
        payload.quantita = form.quantita ? Number(form.quantita) : null;
        payload.unita_misura = form.unita_misura.trim() || null;
      }
      const created = await api.post<Materiale>('/api/materiali', payload);
      push(`Materiale ${created.categoria} lotto ${created.lotto} creato`, 'success');
      reset();
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuovo materiale"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>Annulla</button>
          <button
            type="submit"
            form="materiale-form"
            disabled={busy || form.lotto.trim().length === 0}
          >
            {busy ? 'Salvataggio…' : 'Crea'}
          </button>
        </>
      }
    >
      <form id="materiale-form" onSubmit={submit} className="lavoro-form">
        <section>
          <h3>Identificazione</h3>
          <div className="form-grid form-grid--2">
            <label>
              Categoria*
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaMateriale })}
              >
                {CATEGORIE.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Sottotipo
              <input
                placeholder="es. multilayer, soft"
                value={form.sottotipo}
                onChange={(e) => setForm({ ...form, sottotipo: e.target.value })}
              />
            </label>
            <label>
              Marca
              <input
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </label>
            <label>
              Colore
              <input
                placeholder="es. A2"
                value={form.colore}
                onChange={(e) => setForm({ ...form, colore: e.target.value })}
              />
            </label>
            <label>
              Lotto*
              <input
                value={form.lotto}
                onChange={(e) => setForm({ ...form, lotto: e.target.value })}
                required
              />
            </label>
            <label>
              Deposito
              <select
                value={form.id_deposito}
                onChange={(e) => setForm({ ...form, id_deposito: e.target.value })}
              >
                <option value="">— nessuno —</option>
                {depositi.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
              {depositi.length === 0 && (
                <span className="muted">Crea prima un deposito dalla pagina dedicata.</span>
              )}
            </label>
          </div>
        </section>

        <section>
          <h3>{isCialda(form.categoria) ? 'Dimensioni cialda' : 'Quantità'}</h3>
          {isCialda(form.categoria) ? (
            <div className="form-grid form-grid--2">
              <label>
                Altezza (mm)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.altezza_mm}
                  onChange={(e) => setForm({ ...form, altezza_mm: e.target.value })}
                />
              </label>
              <label>
                Larghezza (mm)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.larghezza_mm}
                  onChange={(e) => setForm({ ...form, larghezza_mm: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <div className="form-grid form-grid--2">
              <label>
                Quantità
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.quantita}
                  onChange={(e) => setForm({ ...form, quantita: e.target.value })}
                />
              </label>
              <label>
                Unità misura
                <input
                  placeholder="es. ml, g, pz"
                  value={form.unita_misura}
                  onChange={(e) => setForm({ ...form, unita_misura: e.target.value })}
                />
              </label>
            </div>
          )}
        </section>

        <section>
          <h3>Stato e alert</h3>
          <div className="form-grid form-grid--2">
            <label>
              Stato utilizzo
              <select
                value={form.stato_utilizzo}
                onChange={(e) => setForm({ ...form, stato_utilizzo: e.target.value as StatoUtilizzo })}
              >
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Soglia alert (scorta minima)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.soglia_alert}
                onChange={(e) => setForm({ ...form, soglia_alert: e.target.value })}
              />
            </label>
          </div>
        </section>

        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
