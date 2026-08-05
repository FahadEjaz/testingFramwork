import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { listDebugSessionDiffs } from '../api';
import { useAuth } from '../auth/AuthContext';

interface DebugSessionDiffsCountValue {
  count: number;
  refresh(): void;
}

const DebugSessionDiffsCountContext = createContext<DebugSessionDiffsCountValue | null>(null);

// Mirrors PendingFixesCountContext exactly (same reasoning: sidebar badge and the review page
// itself need to share one count so approving/rejecting refreshes both) — Phase 12's diffs are a
// separate queue from Pending Fixes (see debugSessionDiffsStore.ts's own reasoning), so it needs
// its own count, not a second consumer of the existing one.
export function DebugSessionDiffsCountProvider({ children }: { children: ReactNode }) {
  const { credentials } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!credentials) return;
    listDebugSessionDiffs(credentials, 'pending')
      .then((diffs) => setCount(diffs.length))
      .catch(() => setCount(0));
  }, [credentials]);

  useEffect(refresh, [refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return <DebugSessionDiffsCountContext.Provider value={value}>{children}</DebugSessionDiffsCountContext.Provider>;
}

export function useDebugSessionDiffsCount(): DebugSessionDiffsCountValue {
  const ctx = useContext(DebugSessionDiffsCountContext);
  if (!ctx) throw new Error('useDebugSessionDiffsCount must be used within DebugSessionDiffsCountProvider');
  return ctx;
}
