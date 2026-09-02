import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { api, ApiError, type CategoriaMateriale, type Deposito, type Materiale, type StatoUtilizzo } from '../api';
import { CATEGORIA_LABEL, STATO_UTILIZZO_LABEL } from '../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (m: Materiale) => void;
  materiale?: Materiale | null;
}

const CATEGORIE: CategoriaMateriale[] = ['zirconio', 'pmma', 'resina', 'metallo', 'ceramica', 'altro'];

// Per zirconio e PMMA il formato standard è la "cialda" (disco) da fresatura,
// quindi mostriamo i campi dimensionali. Per le altre categorie si usa una
// quantità con unità di misura libera. La quantità è sempre visibile: anche
// una cialda ha una misura fisica e un numero di pezzi disponibili.
function isCialda(cat: CategoriaMateriale): boolean {
  return cat === 'zirconio' || cat === 'pmma';
}

function initialForm() {
  return {
    categoria: 'zirconio' as CategoriaMateriale,
    sottotipo: '',
    marca: '',
    colore: '',
    lotto: '',
    id_deposito: '' as string | number,
    altezza_mm: '',
    larghezza_mm: '',
    quantita: '1',
    quantita_parziale: '0',
    unita_misura: 'pz',
    soglia_alert: '',
  };
}

function derivedState(quantita: string, quantitaParziale: string): StatoUtilizzo {
  if (Number(quantitaParziale) > 0) return 'parziale';
  if (Number(quantita) > 0) return 'nuovo';
  return 'esaurito';
}

export function MaterialeFormModal({ open, onClose, onSaved, materiale }: Props) {
  const isEdit = !!materiale;
  const [form, setForm] = useState(initialForm);
  const [depositi, setDepositi] = useState<Deposito[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    api.get<Deposito[]>('/api/depositi?limit=200').then(setDepositi).catch(() => setDepositi([]));
    if (materiale) {
      setForm({
        categoria: materiale.categoria,
        sottotipo: materiale.sottotipo ?? '',
        marca: materiale.marca ?? '',
        colore: materiale.colore ?? '',
        lotto: materiale.lotto,
        id_deposito: materiale.id_deposito ?? '',
        altezza_mm: materiale.altezza_mm ?? '',
        larghezza_mm: materiale.larghezza_mm ?? '',
        quantita: materiale.quantita,
        quantita_parziale: materiale.quantita_parziale,
        unita_misura: materiale.unita_misura ?? '',
        soglia_alert: materiale.soglia_alert ?? '',
      });
    } else {
      setForm(initialForm());
    }
    setError(null);
  }, [materiale, open]);

  function reset() {
    setForm(initialForm());
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
        quantita: Number(form.quantita || 0),
        quantita_parziale: Number(form.quantita_parziale || 0),
        unita_misura: form.unita_misura.trim() || null,
        soglia_alert: form.soglia_alert ? Number(form.soglia_alert) : null,
        altezza_mm: isCialda(form.categoria) && form.altezza_mm ? Number(form.altezza_mm) : null,
        larghezza_mm: isCialda(form.categoria) && form.larghezza_mm ? Number(form.larghezza_mm) : null,
      };
      const saved = isEdit && materiale
        ? await api.patch<Materiale>(`/api/materiali/${materiale.id}`, payload)
        : await api.post<Materiale>('/api/materiali', payload);
      push(
        isEdit
          ? `Materiale lotto ${saved.lotto} aggiornato`
          : `Materiale ${saved.categoria} lotto ${saved.lotto} creato`,
        'success',
      );
      reset();
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  const quantitaNuova = Number(form.quantita || 0);
  const quantitaParziale = Number(form.quantita_parziale || 0);
  const stato = derivedState(form.quantita, form.quantita_parziale);
  const invalidQuantity = !Number.isFinite(quantitaNuova)
    || !Number.isFinite(quantitaParziale)
    || quantitaNuova < 0
    || quantitaParziale < 0
    || (!isEdit && quantitaNuova + quantitaParziale <= 0);

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? `Modifica materiale · lotto ${materiale!.lotto}` : 'Nuovo materiale'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>Annulla</button>
          <button
            type="submit"
            form="materiale-form"
            disabled={busy || form.lotto.trim().length === 0 || invalidQuantity}
          >
            {busy ? 'Salvataggio…' : isEdit ? 'Salva modifiche' : 'Crea'}
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
                {CATEGORIE.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
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
          <h3>Misura e quantità</h3>
          {isCialda(form.categoria) && (
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
          )}
          <div className="form-grid form-grid--2">
            <label>
              Quantità nuova*
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.quantita}
                onChange={(e) => setForm({ ...form, quantita: e.target.value })}
                required
              />
            </label>
            <label>
              Quantità parziale
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.quantita_parziale}
                onChange={(e) => setForm({ ...form, quantita_parziale: e.target.value })}
              />
            </label>
            <label>
              Unità di misura
              <input
                placeholder="es. pz, ml, g"
                value={form.unita_misura}
                onChange={(e) => setForm({ ...form, unita_misura: e.target.value })}
              />
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
          <div className="material-state-preview">
            <span>Stato calcolato</span>
            <strong className={`stock-state stock-state--${stato}`}>{STATO_UTILIZZO_LABEL[stato]}</strong>
            <small>
              Lo stato cambia automaticamente in base alle quantità nuove e parziali.
            </small>
          </div>
          {invalidQuantity && (
            <div className="error">
              {isEdit
                ? 'Le quantità non possono essere negative.'
                : 'Inserisci almeno una unità disponibile.'}
            </div>
          )}
        </section>

        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
