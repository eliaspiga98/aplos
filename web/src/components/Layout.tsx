import { useState, type ReactNode, type ComponentType, type SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { CambioPinModal } from './CambioPinModal';
import { AiWidget } from './AiWidget';
import {
  IconHome, IconBriefcase, IconUserMd, IconBox, IconWarehouse,
  IconUsers, IconLogout, IconKey,
} from './icons';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/',          label: 'Dashboard', icon: IconHome,      end: true },
  { to: '/lavori',    label: 'Lavori',    icon: IconBriefcase },
  { to: '/dottori',   label: 'Dottori',   icon: IconUserMd },
  { to: '/materiali', label: 'Materiali', icon: IconBox },
  { to: '/depositi',  label: 'Depositi',  icon: IconWarehouse },
  { to: '/operatori', label: 'Operatori', icon: IconUsers, adminOnly: true },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [showPin, setShowPin] = useState(false);

  const items = navItems.filter((i) => !i.adminOnly || user?.ruolo === 'admin');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/aplos_logo.jpg" alt="Aplo's" className="brand-logo" />
          <div>
            <div className="brand-text">Aplo's</div>
            <div className="brand-subtitle">Gestionale</div>
          </div>
        </div>

        {user?.usa_demo && (
          <div className="sidebar-demo-badge">
            🎭 Modalità demo
            <div className="muted" style={{ fontSize: '0.7rem', marginTop: '0.15rem' }}>
              Stai operando sul DB di prova
            </div>
          </div>
        )}

        <nav>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
            >
              <Icon className="nav-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{user?.nome?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div className="user-name">{user?.nome}</div>
              <div className="user-role">{user?.ruolo}</div>
            </div>
          </div>
          <button type="button" onClick={() => setShowPin(true)} className="sidebar-btn">
            <IconKey className="nav-icon" /> Cambia PIN
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="sidebar-btn"
          >
            <IconLogout className="nav-icon" /> Esci
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
      <CambioPinModal open={showPin} onClose={() => setShowPin(false)} />
      <AiWidget />
    </div>
  );
}
