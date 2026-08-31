import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from './api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (idOperatore: number, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setLanguage: (language: 'it' | 'en') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: User | null }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (idOperatore: number, pin: string) => {
    const u = await api.post<User>('/api/auth/login', { id_operatore: idOperatore, pin });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    // Anche se la chiamata fallisce (es. rete down, token già invalidato),
    // il client deve comunque "uscire" — altrimenti il bottone Esci sembra
    // non rispondere quando la sessione lato server è già scaduta.
    try {
      await api.post('/api/auth/logout');
    } catch {
      // ignora
    }
    setUser(null);
  }, []);

  const setLanguage = useCallback(async (language: 'it' | 'en') => {
    const updated = await api.patch<User>('/api/auth/me/preferences', { lingua: language });
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve stare dentro AuthProvider');
  return ctx;
}
