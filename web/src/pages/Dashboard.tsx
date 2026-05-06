import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getList, type Lavoro, type Materiale } from '../api';
import { useAuth } from '../auth';
import { IconBriefcase, IconClock, IconAlert, IconCheck, IconBox } from '../components/icons';

const SCADENZA_GIORNI = 7;

function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isSottoSoglia(m: Materiale): boolean {
  if (!m.soglia_alert) return false;
  const soglia = Number(m.soglia_alert);
  const q = m.quantita ? Number(m.quantita) : 0;
  return q <= soglia;
}

function deadlineLabel(d: number): { text: string; tone: 'critical' | 'warning' | 'ok' } {
  if (d < 0) return { text: `${Math.abs(d)} ${Math.abs(d) === 1 ? 'giorno' : 'giorni'} di ritardo`, tone: 'critical' };
  if (d === 0) return { text: 'Oggi', tone: 'critical' };
  if (d === 1) return { text: 'Domani', tone: 'warning' };
  if (d <= 3) return { text: `Tra ${d} giorni`, tone: 'warning' };
  return { text: `Tra ${d} giorni`, tone: 'ok' };
}

const STATO_LABELS: Record<string, string> = {
  in_attesa: 'In attesa',
  in_corso: 'In corso',
  in_prova: 'In prova',
  finito: 'Finito',
};

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getList<Lavoro>('/api/lavori?limit=500'),
      getList<Materiale>('/api/materiali?limit=500'),
    ])
      .then(([l, m]) => {
        setLavori(l.rows);
        setMateriali(m.rows);
      })
      .finally(() => setLoading(false));
  }, []);

  const counts = lavori.reduce(
    (acc, l) => {
      acc[l.stato] = (acc[l.stato] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const codaConsegne = lavori
    .filter((l) => l.stato !== 'finito')
    .sort((a, b) => a.data_consegna.localeCompare(b.data_consegna));
  const inScadenza = codaConsegne.filter((l) => daysFromToday(l.data_consegna) <= SCADENZA_GIORNI);
  const sottoSoglia = materiali.filter(isSottoSoglia);
  const esauriti = materiali.filter((m) => m.stato_utilizzo === 'esaurito');

  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="page dashboard">
      <header className="dashboard-hero">
        <div>
          <div className="dashboard-greeting">
            Ciao, <strong>{user?.nome}</strong>
            {user?.usa_demo && <span className="badge-demo" style={{ marginLeft: '0.6rem' }}>DEMO</span>}
          </div>
          <div className="dashboard-date">{oggi}</div>
        </div>
        <div className="dashboard-hero-counts">
          <div>
            <div className="dashboard-hero-num">{lavori.filter((l) => l.stato !== 'finito').length}</div>
            <div className="dashboard-hero-label">Lavori attivi</div>
          </div>
          <div>
            <div className="dashboard-hero-num">{inScadenza.length}</div>
            <div className="dashboard-hero-label">In scadenza ({SCADENZA_GIORNI}gg)</div>
          </div>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiCard
          icon={<IconBriefcase />}
          label="In attesa"
          value={counts['in_attesa'] ?? 0}
          tone="neutral"
        />
        <KpiCard
          icon={<IconClock />}
          label="In corso"
          value={counts['in_corso'] ?? 0}
          tone="active"
        />
        <KpiCard
          icon={<IconAlert />}
          label="In prova"
          value={counts['in_prova'] ?? 0}
          tone="prova"
        />
        <KpiCard
          icon={<IconCheck />}
          label="Finiti"
          value={counts['finito'] ?? 0}
          tone="success"
        />
        <KpiCard
          icon={<IconBox />}
          label="Materiali sotto soglia"
          value={sottoSoglia.length + esauriti.length}
          tone={(sottoSoglia.length + esauriti.length) > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <header className="card-header">
            <h2>Coda consegne</h2>
            <span className="muted">{codaConsegne.length} lavori attivi</span>
          </header>
          {loading ? (
            <p className="muted">Caricamento…</p>
          ) : codaConsegne.length === 0 ? (
            <p className="muted">Nessun lavoro attivo.</p>
          ) : (
            <ul className="queue">
              {codaConsegne.slice(0, 8).map((l) => {
                const d = daysFromToday(l.data_consegna);
                const lbl = deadlineLabel(d);
                return (
                  <li
                    key={l.id}
                    className={`queue-item queue-item--${l.stato}`}
                    onClick={() => navigate(`/lavori?open=${l.id}`)}
                  >
                    <div className="queue-item-main">
                      <div className="queue-item-paziente">
                        {l.nome_paziente}
                        <span className={`stato-pill stato-pill--${l.stato}`}>{STATO_LABELS[l.stato]}</span>
                      </div>
                      <div className="queue-item-meta muted">
                        #{l.id} · {l.dottore_nome}
                        {l.dottore_studio ? ` — ${l.dottore_studio}` : ''}
                      </div>
                    </div>
                    <div className={`queue-item-deadline queue-deadline--${lbl.tone}`}>
                      <div className="queue-deadline-rel">{lbl.text}</div>
                      <div className="queue-deadline-date">
                        {new Date(l.data_consegna).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {codaConsegne.length > 8 && (
            <button type="button" className="btn-link" onClick={() => navigate('/lavori')}>
              Vedi tutti i {codaConsegne.length} lavori →
            </button>
          )}
        </section>

        <section className="card">
          <header className="card-header">
            <h2>Magazzino</h2>
            <span className="muted">
              {sottoSoglia.length} sotto soglia · {esauriti.length} esauriti
            </span>
          </header>
          {loading ? (
            <p className="muted">Caricamento…</p>
          ) : sottoSoglia.length === 0 && esauriti.length === 0 ? (
            <p className="muted">Tutto sotto controllo. Nessun materiale critico.</p>
          ) : (
            <ul className="material-alerts">
              {[...esauriti, ...sottoSoglia.filter((m) => !esauriti.includes(m))].slice(0, 8).map((m) => (
                <li
                  key={m.id}
                  className={`material-alert material-alert--${m.stato_utilizzo}`}
                  onClick={() => navigate(`/materiali?q=${encodeURIComponent(m.lotto)}`)}
                >
                  <div>
                    <div className="material-alert-title">
                      {m.categoria} {m.marca ?? ''} {m.colore ?? ''}
                    </div>
                    <div className="muted">Lotto {m.lotto}</div>
                  </div>
                  <div className="material-alert-status">
                    {m.stato_utilizzo === 'esaurito'
                      ? <span className="stato-pill stato-pill--esaurito">Esaurito</span>
                      : <span className="muted">{m.quantita} {m.unita_misura ?? ''} / {m.soglia_alert}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

interface KpiProps {
  icon: ReactNodeLike;
  label: string;
  value: number;
  tone?: 'neutral' | 'active' | 'prova' | 'success' | 'warn';
}
type ReactNodeLike = React.ReactNode;

function KpiCard({ icon, label, value, tone = 'neutral' }: KpiProps) {
  return (
    <div className={`kpi-card kpi-card--${tone}`}>
      <div className="kpi-card-icon">{icon}</div>
      <div>
        <div className="kpi-card-value">{value}</div>
        <div className="kpi-card-label">{label}</div>
      </div>
    </div>
  );
}
