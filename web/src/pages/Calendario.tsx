import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getList, type Lavoro } from '../api';
import { CalendarView } from '../components/CalendarView';

export function CalendarioPage() {
  const navigate = useNavigate();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getList<Lavoro>('/api/lavori?limit=500')
      .then(({ rows }) => setLavori(rows))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page page--fullheight">
      <header className="page-header">
        <h1>Calendario consegne</h1>
      </header>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <CalendarView
          lavori={lavori}
          fillHeight
          onLavoroClick={(id) => navigate(`/lavori?open=${id}`)}
        />
      )}
    </div>
  );
}
