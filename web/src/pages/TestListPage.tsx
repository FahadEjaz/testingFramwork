import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRunsForTest, listTests } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusLamp } from '../components/StatusLamp';
import { runLamp } from '../lib/runStatus';
import type { Run, TestCase } from '../types';
import styles from './TestListPage.module.css';

export function TestListPage() {
  const { credentials } = useAuth();
  const [tests, setTests] = useState<TestCase[] | null>(null);
  const [latestRuns, setLatestRuns] = useState<Record<string, Run | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;

    listTests(credentials)
      .then(async (fetched) => {
        if (cancelled) return;
        setTests(fetched);
        const runsByTest = await Promise.all(
          fetched.map((t) =>
            listRunsForTest(credentials, t.id)
              .then((runs) => runs[0])
              .catch(() => undefined)
          )
        );
        if (cancelled) return;
        setLatestRuns(Object.fromEntries(fetched.map((t, i) => [t.id, runsByTest[i]])));
      })
      .catch(() => setError('Could not load tests.'));

    return () => {
      cancelled = true;
    };
  }, [credentials]);

  return (
    <div>
      <div className={styles.header}>
        <h1>Tests</h1>
        <Link className={styles.newButton} to="/record">
          + New Recording
        </Link>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {tests && (
        <div className={styles.list}>
          {tests.length === 0 && (
            <div className={styles.empty}>No tests yet. Record one to get started.</div>
          )}
          {tests.map((test) => {
            const latest = latestRuns[test.id];
            return (
              <Link className={styles.row} to={`/tests/${test.id}`} key={test.id}>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>{test.name}</div>
                  <div className={styles.rowSpec}>{test.specPath}</div>
                </div>
                <div className={styles.rowLamp}>
                  {latest ? <StatusLamp {...runLamp(latest)} /> : <span className={styles.rowSpec}>no runs</span>}
                </div>
                <div className={styles.rowChevron}>&rsaquo;</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
