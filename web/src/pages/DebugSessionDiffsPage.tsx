import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listDebugSessionDiffs, updateDebugSessionDiff } from '../api';
import { useDebugSessionDiffsCount } from '../state/DebugSessionDiffsCountContext';
import type { DebugSessionDiff } from '../types';
import { useAuth } from '../auth/AuthContext';
import styles from './DebugSessionDiffsPage.module.css';

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className={styles.diff}>
      {diff.split('\n').map((line, i) => {
        const tone = line.startsWith('+') && !line.startsWith('+++') ? styles.diffAdd
          : line.startsWith('-') && !line.startsWith('---') ? styles.diffDel
          : line.startsWith('@@') ? styles.diffHunk
          : undefined;
        return (
          <div className={tone} key={i}>
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}

// Review queue for Phase 12's debug-session diffs (see PLAN.md's gated "In-app AI debug
// terminal") — deliberately its own page/store, not folded into PendingFixesPage: a live-coding
// session's diff is unstructured/multi-file, not a single before/after locator swap.
export function DebugSessionDiffsPage() {
  const { credentials } = useAuth();
  const { refresh: refreshCount } = useDebugSessionDiffsCount();
  const [diffs, setDiffs] = useState<DebugSessionDiff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!credentials) return;
    listDebugSessionDiffs(credentials, 'pending').then(setDiffs);
  }

  useEffect(reload, [credentials]);

  async function decide(id: string, status: 'approved' | 'rejected') {
    if (!credentials) return;
    setError(null);
    try {
      await updateDebugSessionDiff(credentials, id, status);
      reload();
      refreshCount();
    } catch (err) {
      // Approve can 409 if the live file drifted since this diff was captured — surface it
      // instead of the card silently failing to disappear.
      setError(
        err instanceof ApiError ? err.message : `Could not ${status === 'approved' ? 'approve' : 'reject'} this diff.`
      );
    }
  }

  return (
    <div>
      <h1>Debug Session Diffs</h1>
      <p className={styles.subhead}>Changes proposed by an in-app AI debug session — nothing here applies until you approve it.</p>

      {error && <p className={styles.error}>{error}</p>}

      {diffs && diffs.length === 0 && (
        <div className={styles.empty}>Nothing waiting on review — diffs submitted from a debug session show up here.</div>
      )}

      <div className={styles.list}>
        {diffs?.map((record) => (
          <div className={styles.card} key={record.id}>
            <div className={styles.cardTop}>
              <div>
                <div className={styles.cardTitle}>{record.files.join(', ')}</div>
                <Link className={styles.cardSpec} to={`/tests/${record.testId}`}>
                  View test
                </Link>
              </div>
            </div>
            <DiffView diff={record.diff} />
            <div className={styles.actions}>
              <button className={styles.reject} onClick={() => decide(record.id, 'rejected')} type="button">
                Reject
              </button>
              <button className={styles.approve} onClick={() => decide(record.id, 'approved')} type="button">
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
