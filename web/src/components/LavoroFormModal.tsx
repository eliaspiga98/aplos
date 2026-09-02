import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Odontogramma, type Struttura } from './Odontogramma';
import { MaterialUsagePicker } from './MaterialUsagePicker';
import { useToast } from './Toaster';
import {
  api,
  ApiError,
  type Dottore,
  type Lavoro,
  type LavoroDettaglio,
  type Materiale,
  type MaterialUsageInput,
} from '../api';
import { addDaysDateInput, labelCategoria, todayDateInput, toDateInputValue } from '../utils/format';
import { DottoreFormModal } from './DottoreFormModal';
import { VitaShadePicker } from './VitaShadePicker';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (l: Lavoro) => void;
  lavoro?: LavoroDettaglio | null;
}

function initialForm() {
  return {
    id_dottore: '' as string | number,
    nome_paziente: '',
    data_entrata: todayDateInput(),
    data_consegna: addDaysDateInput(7),
    scala_colori: '',
    tipologia_lavoro: '',
    note_istruzioni: '',
  };
}

export function LavoroFormModal({ open, onClose, onSaved, lavoro }: Props) {
  const isEdit = !!lavoro;
  const [form, setForm] = useState(initialForm);
  const [strutture, setStrutture] = useState<Struttura[]>([]);
  const [dottori, setDottori] = useState<Dottore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [materialiDaAggiungere, setMaterialiDaAggiungere] = useState<Array<{
    usage: MaterialUsageInput;
    material: Materiale;
  }>>([]);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    api.get<Dottore[]>('/api/dottori?limit=500').then(setDottori).catch(() => setDottori([]));
  }, [open]);

  // Quando entriamo in modalità edit pre-popoliamo il form.
  useEffect(() => {
    if (lavoro) {
      setForm({
        id_dottore: lavoro.id_dottore,
        nome_paziente: lavoro.nome_paziente,
        data_entrata: toDateInputValue(lavoro.data_entrata),
        data_consegna: toDateInputValue(lavoro.data_consegna),
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
      setForm(initialForm());
      setStrutture([]);
    }
    setMaterialiDaAggiungere([]);
    setError(null);
  }, [lavoro, open]);

  function close() {
    if (!isEdit) {
      setForm(initialForm());
      setStrutture([]);
    }
    setError(null);
    setSubmitting(false);
    setMaterialiDaAggiungere([]);
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
        await api.post(`/api/lavori/${lavoro.id}/strutture`, { strutture });
        saved = await api.patch<Lavoro>(`/api/lavori/${lavoro.id}`, {
          ...basePayload,
          materiali: materialiDaAggiungere.map((item) => item.usage),
        });
        push(`Lavoro #${saved.id} aggiornato`, 'success');
      } else {
        saved = await api.post<Lavoro>('/api/lavori', {
          ...basePayload,
          strutture: strutture.length > 0 ? strutture : undefined,
          materiali: materialiDaAggiungere.length > 0
            ? materialiDaAggiungere.map((item) => item.usage)
            : undefined,
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
            <div className="form-field">
              <div className="field-label-row">
                <span>Dottore*</span>
                <button type="button" className="btn-link" onClick={() => setShowDoctorForm(true)}>+ Nuovo dottore</button>
              </div>
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
            </div>
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
              <VitaShadePicker
                value={form.scala_colori}
                onChange={(scala_colori) => setForm({ ...form, scala_colori })}
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
          <h3>Materiali del lavoro</h3>
          {isEdit && lavoro && lavoro.materiali.length > 0 && (
            <div className="work-material-existing">
              <strong>Già registrati</strong>
              <ul>
                {lavoro.materiali.map((item) => (
                  <li key={item.id}>
                    <span>{labelCategoria(item.categoria)} · lotto {item.lotto}</span>
                    <span>
                      {item.stato_prelievo === 'parziale' ? 'Parziale' : item.stato_prelievo === 'nuovo' ? 'Nuovo' : 'Storico'}
                      {' · '}{item.quantita_usata ?? '—'} {item.unita_misura ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
              <small className="muted">Gli utilizzi già registrati restano nello storico MDR.</small>
            </div>
          )}

          {materialiDaAggiungere.length > 0 && (
            <div className="work-material-drafts">
              <strong>Da aggiungere al salvataggio</strong>
              {materialiDaAggiungere.map((item, index) => (
                <div className="work-material-draft" key={`${item.usage.id_materiale}-${item.usage.stato_prelievo}-${index}`}>
                  <span>
                    {labelCategoria(item.material.categoria)} · {item.material.marca ?? ''}
                    {' · '}lotto {item.material.lotto}
                  </span>
                  <span>
                    {item.usage.stato_prelievo === 'nuovo' ? 'Nuovo' : 'Parziale'}
                    {' · '}{item.usage.quantita_usata} {item.material.unita_misura ?? ''}
                  </span>
                  <button
                    type="button"
                    className="btn-link btn-link--danger"
                    onClick={() => setMaterialiDaAggiungere((current) => current.filter((_, i) => i !== index))}
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          )}

          <MaterialUsagePicker
            reserved={materialiDaAggiungere.map((item) => item.usage)}
            disabled={submitting}
            onAdd={(usage, material) => {
              setMaterialiDaAggiungere((current) => [...current, { usage, material }]);
            }}
          />
        </section>

        <section>
          <h3>Odontogramma</h3>
          <Odontogramma value={strutture} onChange={setStrutture} />
        </section>

        {error && <div className="error">{error}</div>}
      </form>
      <DottoreFormModal
        open={showDoctorForm}
        onClose={() => setShowDoctorForm(false)}
        onSaved={(doctor) => {
          setDottori((current) => [...current.filter((d) => d.id !== doctor.id), doctor]
            .sort((a, b) => a.nome.localeCompare(b.nome)));
          setForm((current) => ({ ...current, id_dottore: doctor.id }));
        }}
      />
    </Modal>
  );
}
