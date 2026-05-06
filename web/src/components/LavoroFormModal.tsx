import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Odontogramma, type Struttura } from './Odontogramma';
import { useToast } from './Toaster';
import { api, ApiError, type Dottore, type Lavoro, type LavoroDettaglio } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (l: Lavoro) => void;
  lavoro?: LavoroDettaglio | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const initial = {
  id_dottore: '' as string | number,
  nome_paziente: '',
  data_entrata: todayISO(),
  data_consegna: plusDaysISO(7),
  scala_colori: '',
  tipologia_lavoro: '',
  note_istruzioni: '',
};

export function LavoroFormModal({ open, onClose, onSaved, lavoro }: Props) {
  const isEdit = !!lavoro;
  const [form, setForm] = useState(initial);
  const [strutture, setStrutture] = useState<Struttura[]>([]);
  const [dottori, setDottori] = useState<Dottore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    api.get<Dottore[]>('/api/dottori?limit=200').then(setDottori).catch(() => setDottori([]));
  }, [open]);

  // Quando entriamo in modalità edit pre-popoliamo il form.
  useEffect(() => {
    if (lavoro) {
      setForm({
        id_dottore: lavoro.id_dottore,
        nome_paziente: lavoro.nome_paziente,
        data_entrata: lavoro.data_entrata.slice(0, 10),
        data_consegna: lavoro.data_consegna.slice(0, 10),
        scala_colori: lavoro.scala_colori ?? '',
        tipologia_lavoro: lavoro.tipologia_lavoro ?? '',
        note_istruzioni: lavoro.note_istruzioni ?? '',
      });
      setStrutture(
        lavoro.strutture.map((s) => ({
          tipo_struttura: s.tipo_struttura,
          elementi_dentali: s.elementi_dentali,
        })),
      );
    } else {
      setForm(initial);
      setStrutture([]);
    }
    setError(null);
  }, [lavoro, open]);

  function close() {
    if (!isEdit) {
      setForm(initial);
      setStrutture([]);
    }
    setError(null);
    setSubmitting(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.id_dottore) {
      setError('Seleziona un dottore');
      return;
    }
    if (form.data_consegna < form.data_entrata) {
      setError('La data di consegna non può essere prima della data di entrata');
      return;
    }

    setSubmitting(true);
    try {
      const basePayload = {
        id_dottore: Number(form.id_dottore),
        nome_paziente: form.nome_paziente.trim(),
        data_entrata: form.data_entrata,
        data_consegna: form.data_consegna,
        scala_colori: form.scala_colori.trim() || null,
        tipologia_lavoro: form.tipologia_lavoro.trim() || null,
        note_istruzioni: form.note_istruzioni.trim() || null,
      };

      let saved: Lavoro;
      if (isEdit && lavoro) {
        saved = await api.patch<Lavoro>(`/api/lavori/${lavoro.id}`, basePayload);
        await api.post(`/api/lavori/${lavoro.id}/strutture`, { strutture });
        push(`Lavoro #${saved.id} aggiornato`, 'success');
      } else {
        saved = await api.post<Lavoro>('/api/lavori', {
          ...basePayload,
          strutture: strutture.length > 0 ? strutture : undefined,
        });
        push(`Lavoro #${saved.id} creato`, 'success');
      }

      onSaved(saved);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? `Modifica lavoro #${lavoro!.id}` : 'Nuovo lavoro'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>Annulla</button>
          <button
            type="submit"
            form="lavoro-form"
            disabled={
              submitting ||
              !form.id_dottore ||
              form.nome_paziente.trim().length === 0
            }
          >
            {submitting ? 'Salvataggio…' : isEdit ? 'Salva modifiche' : 'Crea lavoro'}
          </button>
        </>
      }
    >
      <form id="lavoro-form" onSubmit={handleSubmit} className="lavoro-form">
        <section>
          <h3>Anagrafica</h3>
          <div className="form-grid form-grid--2">
            <label>
              Dottore*
              <select
                value={form.id_dottore}
                onChange={(e) => setForm({ ...form, id_dottore: e.target.value })}
                required
              >
                <option value="">— seleziona —</option>
                {dottori.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                    {d.studio ? ` — ${d.studio}` : ''}
                  </option>
                ))}
              </select>
              {dottori.length === 0 && (
                <span className="muted">Nessun dottore. Crea prima un dottore.</span>
              )}
            </label>
            <label>
              Paziente*
              <input
                value={form.nome_paziente}
                onChange={(e) => setForm({ ...form, nome_paziente: e.target.value })}
                required
              />
            </label>
          </div>
        </section>

        <section>
          <h3>Date</h3>
          <div className="form-grid form-grid--2">
            <label>
              Data entrata
              <input
                type="date"
                value={form.data_entrata}
                onChange={(e) => setForm({ ...form, data_entrata: e.target.value })}
                required
              />
            </label>
            <label>
              Data consegna
              <input
                type="date"
                value={form.data_consegna}
                onChange={(e) => setForm({ ...form, data_consegna: e.target.value })}
                required
              />
            </label>
          </div>
        </section>

        <section>
          <h3>Dati tecnici</h3>
          <div className="form-grid form-grid--2">
            <label>
              Scala colori
              <input
                placeholder="es. A2"
                value={form.scala_colori}
                onChange={(e) => setForm({ ...form, scala_colori: e.target.value })}
              />
            </label>
            <label>
              Tipologia
              <input
                placeholder="es. Corona singola in zirconio"
                value={form.tipologia_lavoro}
                onChange={(e) => setForm({ ...form, tipologia_lavoro: e.target.value })}
              />
            </label>
          </div>
          <label>
            Istruzioni
            <textarea
              rows={3}
              value={form.note_istruzioni}
              onChange={(e) => setForm({ ...form, note_istruzioni: e.target.value })}
            />
          </label>
        </section>

        <section>
          <h3>Odontogramma</h3>
          <Odontogramma value={strutture} onChange={setStrutture} />
        </section>

        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
