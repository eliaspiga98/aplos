import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { LavoriPage } from './pages/Lavori';
import { LavoroStampaPage } from './pages/LavoroStampa';
import { DottoriPage } from './pages/Dottori';
import { MaterialiPage } from './pages/Materiali';
import { DepositiPage } from './pages/Depositi';
import { OperatoriPage } from './pages/Operatori';
import { useInactivityLogout } from './hooks/useInactivityLogout';

const INACTIVITY_MINUTES = Number(import.meta.env.VITE_INACTIVITY_LOGOUT_MINUTES ?? '30');

export default function App() {
  const { user, loading, logout } = useAuth();

  useInactivityLogout(INACTIVITY_MINUTES, !!user, () => void logout());

  if (loading) {
    return <div className="splash">Caricamento…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* La pagina di stampa esce dal Layout: niente sidebar, layout A4 dedicato. */}
      <Route path="/lavori/:id/stampa" element={<LavoroStampaPage />} />
      <Route
        path="*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/lavori" element={<LavoriPage />} />
              <Route path="/dottori" element={<DottoriPage />} />
              <Route path="/materiali" element={<MaterialiPage />} />
              <Route path="/depositi" element={<DepositiPage />} />
              <Route path="/operatori" element={<OperatoriPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}
