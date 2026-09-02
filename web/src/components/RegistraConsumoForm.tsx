import { api, ApiError, type MaterialUsageInput } from '../api';
import { MaterialUsagePicker } from './MaterialUsagePicker';

interface Props {
  idLavoro: number;
  onCancel: () => void;
  onSaved: () => void;
}

export function RegistraConsumoForm({ idLavoro, onCancel, onSaved }: Props) {
  async function save(usage: MaterialUsageInput) {
    try {
      await api.post(`/api/lavori/${idLavoro}/materiali`, usage);
      onSaved();
    } catch (error) {
      throw new Error(error instanceof ApiError ? error.message : 'Impossibile registrare il materiale');
    }
  }

  return (
    <div className="inline-form">
      <MaterialUsagePicker onAdd={save} buttonLabel="Registra utilizzo" />
      <div className="inline-form-actions material-usage-cancel">
        <button type="button" className="btn-secondary" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}
