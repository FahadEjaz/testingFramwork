import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getAiUsage, listPendingFixes, updatePendingFix } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusLamp } from '../components/StatusLamp';
import { formatLocator } from '../lib/runStatus';
import { usePendingFixesCount } from '../state/PendingFixesCountContext';
import type { AiUsageSummary, PendingFix } from '../types';
import styles from './PendingFixesPage.module.css';

export function PendingFixesPage() {
  const { credentials } = useAuth();
  const { refresh: refreshCount } = usePendingFixesCount();
  const [fixes, setFixes] = useState<PendingFix[] | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!credentials) return;
    listPendingFixes(credentials, 'pending').then(setFixes);
    getAiUsage(credentials).then(setAiUsage);
  }

  useEffect(reload, [credentials]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    if (!credentials) return;
    setError(null);
    try {
      await updatePendingFix(credentials, id, status);
      reload();
      refreshCount();
    } catch (err) {
      // Approve can fail if the test/manifest changed since this fix was queued (e.g.
      // re-recorded) — surface it instead of letting the fix vanish from the list unexplained.
      setError(err instanceof ApiError ? err.message : `Could not ${status === 'approved' ? 'approve' : 'reject'} this fix.`);
    }
  }

  return (
    <div>
      <h1>Pending Fixes</h1>

      {aiUsage && aiUsage.totalHeals > 0 && (
        <div className={styles.usageSummary}>
          AI healing spend to date: {aiUsage.totalHeals} heal{aiUsage.totalHeals === 1 ? '' : 's'} ·{' '}
          {aiUsage.totalInputTokens.toLocaleString()} input / {aiUsage.totalOutputTokens.toLocaleString()} output
          tokens
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {fixes && fixes.length === 0 && (
        <div className={styles.empty}>Nothing waiting on review — self-healed locators show up here.</div>
      )}

      <div className={styles.list}>
        {fixes?.map((fix) => (
          <div className={styles.card} key={fix.id}>
            <div className={styles.cardTop}>
              <div>
                <div className={styles.cardTitle}>{fix.elementKey}</div>
                <Link className={styles.cardSpec} to={`/tests/${fix.testId}`}>
                  {fix.spec}
                </Link>
              </div>
              <StatusLamp
                tone="healed"
                label={fix.source === 'ai' ? 'AI-healed' : 'Fallback-healed'}
              />
            </div>
            <div className={styles.diff}>
              <span className={styles.diffOld}>− {formatLocator(fix.oldPrimary)}</span>
              <span className={styles.diffNew}>+ {formatLocator(fix.newPrimary)}</span>
            </div>
            {fix.tokensUsed && (
              <div className={styles.tokens}>
                {fix.tokensUsed.inputTokens} in / {fix.tokensUsed.outputTokens} out tokens
              </div>
            )}
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
