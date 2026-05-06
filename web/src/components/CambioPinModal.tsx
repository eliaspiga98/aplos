import { useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toaster';
import { api, ApiError } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CambioPinModal({ open, onClose }: Props) {
  const [pinAttuale, setPinAttuale] = useState('');
  const [pinNuovo, setPinNuovo] = useState('');
  const [pinConferma, setPinConferma] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function reset() {
    setPinAttuale('');
    setPinNuovo('');
    setPinConferma('');
    setError(null);
    setSuccess(false);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pinNuovo !== pinConferma) {
      setError('Il nuovo PIN e la conferma non coincidono');
      return;
    }
    if (pinNuovo === pinAttuale) {
      setError('Il nuovo PIN deve essere diverso da quello attuale');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/me/pin', {
        pin_attuale: pinAttuale,
        pin_nuovo: pinNuovo,
      });
      setSuccess(true);
      push('PIN aggiornato', 'success');
      setPinAttuale('');
      setPinNuovo('');
      setPinConferma('');
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
      title="Cambia PIN"
      footer={
        success ? (
          <button type="button" onClick={close}>Chiudi</button>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={close}>Annulla</button>
            <button
              type="submit"
              form="pin-form"
              disabled={
                busy ||
                pinAttuale.length < 4 ||
                pinNuovo.length < 4 ||
                pinConferma.length < 4
              }
            >
              {busy ? 'Salvataggio…' : 'Cambia PIN'}
            </button>
          </>
        )
      }
    >
      {success ? (
        <p>PIN aggiornato.</p>
      ) : (
        <form id="pin-form" onSubmit={submit} className="form-grid">
          <label>
            PIN attuale
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              value={pinAttuale}
              onChange={(e) => setPinAttuale(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label>
            Nuovo PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              value={pinNuovo}
              onChange={(e) => setPinNuovo(e.target.value)}
              required
            />
          </label>
          <label>
            Conferma nuovo PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={12}
              value={pinConferma}
              onChange={(e) => setPinConferma(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
