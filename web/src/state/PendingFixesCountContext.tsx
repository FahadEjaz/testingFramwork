import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { listPendingFixes } from '../api';
import { useAuth } from '../auth/AuthContext';

interface PendingFixesCountValue {
  count: number;
  refresh(): void;
}

const PendingFixesCountContext = createContext<PendingFixesCountValue | null>(null);

// Owned here (above the router's Outlet) so the sidebar badge and the Pending Fixes page share
// one count — approving/rejecting a fix refreshes both instead of leaving the badge stale.
export function PendingFixesCountProvider({ children }: { children: ReactNode }) {
  const { credentials } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!credentials) return;
    listPendingFixes(credentials, 'pending')
      .then((fixes) => setCount(fixes.length))
      .catch(() => setCount(0));
  }, [credentials]);

  useEffect(refresh, [refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return <PendingFixesCountContext.Provider value={value}>{children}</PendingFixesCountContext.Provider>;
}

export function usePendingFixesCount(): PendingFixesCountValue {
  const ctx = useContext(PendingFixesCountContext);
  if (!ctx) throw new Error('usePendingFixesCount must be used within PendingFixesCountProvider');
  return ctx;
}
