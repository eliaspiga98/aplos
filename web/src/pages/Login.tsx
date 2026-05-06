import { useEffect, useState } from 'react';
import { api, ApiError, type User } from '../api';
import { useAuth } from '../auth';

export function LoginPage() {
  const { login } = useAuth();
  const [operatori, setOperatori] = useState<User[]>([]);
  const [idOperatore, setIdOperatore] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<User[]>('/api/auth/operatori')
      .then((rows) => {
        setOperatori(rows);
        if (rows.length > 0) setIdOperatore(rows[0]!.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Errore'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (idOperatore == null) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(idOperatore, pin);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Errore di accesso';
      setError(msg);
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-card">
        <img src="/aplos_logo.jpg" alt="Aplo's" className="login-logo" />
        <h1>Aplo's</h1>
        <p className="muted">Accedi per iniziare</p>

        <label>
          Operatore
          <select
            value={idOperatore ?? ''}
            onChange={(e) => setIdOperatore(Number(e.target.value))}
            required
          >
            {operatori.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
            required
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={submitting || pin.length < 4}>
          {submitting ? 'Accesso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}
