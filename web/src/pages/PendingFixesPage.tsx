import { useEffect, useState } from 'react';
import { listPendingFixes, updatePendingFix } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusLamp } from '../components/StatusLamp';
import { formatLocator } from '../lib/runStatus';
import { usePendingFixesCount } from '../state/PendingFixesCountContext';
import type { PendingFix } from '../types';
import styles from './PendingFixesPage.module.css';

export function PendingFixesPage() {
  const { credentials } = useAuth();
  const { refresh: refreshCount } = usePendingFixesCount();
  const [fixes, setFixes] = useState<PendingFix[] | null>(null);

  function reload() {
    if (!credentials) return;
    listPendingFixes(credentials, 'pending').then(setFixes);
  }

  useEffect(reload, [credentials]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    if (!credentials) return;
    await updatePendingFix(credentials, id, status);
    reload();
    refreshCount();
  }

  return (
    <div>
      <h1>Pending Fixes</h1>

      {fixes && fixes.length === 0 && (
        <div className={styles.empty}>Nothing waiting on review — self-healed locators show up here.</div>
      )}

      <div className={styles.list}>
        {fixes?.map((fix) => (
          <div className={styles.card} key={fix.id}>
            <div className={styles.cardTop}>
              <div className={styles.cardTitle}>{fix.elementKey}</div>
              <StatusLamp
                tone="healed"
                label={fix.source === 'ai' ? 'AI-healed' : 'Fallback-healed'}
              />
            </div>
            <div className={styles.cardSpec}>{fix.spec}</div>
            <div className={styles.diff}>
              <span className={styles.diffOld}>− {formatLocator(fix.oldPrimary)}</span>
              <span className={styles.diffNew}>+ {formatLocator(fix.newPrimary)}</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.reject} onClick={() => decide(fix.id, 'rejected')} type="button">
                Reject
              </button>
              <button className={styles.approve} onClick={() => decide(fix.id, 'approved')} type="button">
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
