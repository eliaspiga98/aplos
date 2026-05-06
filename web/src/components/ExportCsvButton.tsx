import { BASE_URL } from '../api';

interface Props {
  /**
   * Path dell'endpoint CSV (es. "/api/lavori/csv"). I filtri sono passati
   * come query string `params`.
   */
  path: string;
  /** Search params correnti della pagina (es. q, stato). */
  params?: URLSearchParams;
  label?: string;
}

/**
 * Bottone che apre l'export CSV in una nuova tab. Il browser scarica il file
 * grazie all'header Content-Disposition. L'autenticazione passa via cookie
 * di sessione automaticamente.
 */
export function ExportCsvButton({ path, params, label = 'Esporta CSV' }: Props) {
  const qs = params ? params.toString() : '';
  const href = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  return (
    <a className="btn-link export-csv" href={href} target="_blank" rel="noreferrer">
      ⬇ {label}
    </a>
  );
}
