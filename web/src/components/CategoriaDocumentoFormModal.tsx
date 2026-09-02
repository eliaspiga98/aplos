import { useEffect, useState } from 'react';

import { api, ApiError, type CategoriaDocumento } from '../api';
import { Modal } from './Modal';
import { useToast } from './Toaster';

interface Props {
  open: boolean;
  category?: CategoriaDocumento | null;
  onClose: () => void;
  onSaved: (category: CategoriaDocumento) => void;
}

export function CategoriaDocumentoFormModal({ open, category, onClose, onSaved }: Props) {
  const isEdit = category != null;
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    setNome(category?.nome ?? '');
    setDescrizione(category?.descrizione ?? '');
    setError(null);
  }, [category, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { nome: nome.trim(), descrizione: descrizione.trim() || null };
      const saved = isEdit
        ? await api.patch<CategoriaDocumento>(`/api/documenti/categorie/${category.id}`, payload)
        : await api.post<CategoriaDocumento>('/api/documenti/categorie', payload);
      push(isEdit ? `Categoria "${saved.nome}" aggiornata` : `Categoria "${saved.nome}" creata`);
      onSaved(saved);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Impossibile salvare la categoria');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifica categoria' : 'Nuova categoria documenti'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" form="categoria-documento-form" disabled={busy || !nome.trim()}>
            {busy ? 'Salvataggio…' : isEdit ? 'Salva modifiche' : 'Crea categoria'}
          </button>
        </>
      }
    >
      <form id="categoria-documento-form" className="form-grid" onSubmit={submit}>
        <label>
          Nome categoria*
          <input
            autoFocus
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="es. Protocolli CAD, Ceramica, Sicurezza"
            maxLength={120}
            required
          />
        </label>
        <label>
          Descrizione
          <textarea
            rows={3}
            value={descrizione}
            onChange={(event) => setDescrizione(event.target.value)}
            placeholder="Quali documenti raccoglie questa categoria"
            maxLength={500}
          />
        </label>
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
