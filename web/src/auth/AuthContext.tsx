import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { checkCredentials } from '../api';
import type { Credentials } from './credentials';
import { clearCredentials, loadCredentials, saveCredentials } from './credentials';

interface AuthContextValue {
  credentials: Credentials | null;
  login(username: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());

  const login = useCallback(async (username: string, password: string) => {
    const candidate: Credentials = { username, password };
    // Validate against a real endpoint up front so a wrong password fails at the login screen,
    // not silently on the first click inside the app.
    await checkCredentials(candidate);
    saveCredentials(candidate);
    setCredentials(candidate);
  }, []);

  const logout = useCallback(() => {
    clearCredentials();
    setCredentials(null);
  }, []);

  const value = useMemo(() => ({ credentials, login, logout }), [credentials, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
