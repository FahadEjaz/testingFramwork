import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteTest, listRunsForTest, listTests, renameTest, triggerRun } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusLamp } from '../components/StatusLamp';
import { runLamp, timeAgo } from '../lib/runStatus';
import type { Run, TestCase } from '../types';
import styles from './TestDetailPage.module.css';

export function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [test, setTest] = useState<TestCase | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function reload() {
    if (!credentials || !id) return;
    const [tests, testRuns] = await Promise.all([listTests(credentials), listRunsForTest(credentials, id)]);
    setTest(tests.find((t) => t.id === id) ?? null);
    setRuns(testRuns);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, id]);

  async function handleRun() {
    if (!credentials || !id) return;
    setRunning(true);
    setRunError(null);
    try {
      await triggerRun(credentials, id);
      await reload();
    } catch {
      setRunError('Run failed to start.');
    } finally {
      setRunning(false);
    }
  }

  async function handleRename() {
    if (!credentials || !id || !test) return;
    const name = window.prompt('Rename test', test.name);
    if (!name || !name.trim() || name === test.name) return;
    await renameTest(credentials, id, name.trim());
    await reload();
  }

  async function handleDelete() {
    if (!credentials || !id || !test) return;
    if (!window.confirm(`Delete "${test.name}"? This only removes it from the list — the spec file itself is untouched.`)) return;
    await deleteTest(credentials, id);
    navigate('/');
  }

  if (!test) return null;

  return (
    <div>
      <Link className={styles.back} to="/">
        &lsaquo; Back to tests
      </Link>

      <div className={styles.header}>
        <h1>{test.name}</h1>
        <div className={styles.headerActions}>
          <button className={styles.textButton} onClick={handleRename} type="button">
            Rename
          </button>
          <button className={styles.textButton} onClick={handleDelete} type="button">
            Delete
          </button>
          <Link className={styles.textButton} to={`/tests/${id}/edit`}>
            Edit Script
          </Link>
          <button className={styles.runButton} onClick={handleRun} disabled={running} type="button">
            {running ? 'Running…' : '▶ Run'}
          </button>
        </div>
      </div>
      <div className={styles.spec}>{test.specPath}</div>

      {runError && <p className={styles.runError}>{runError}</p>}

      <h3 style={{ marginBottom: 10 }}>Run history</h3>
      <div className={styles.history}>
        {runs && runs.length === 0 && <div className={styles.empty}>No runs yet — click Run to try this test.</div>}
        {runs?.map((run) => (
          <Link className={styles.historyRow} key={run.id} to={`/tests/${id}/runs/${run.id}`}>
            <div className={styles.historyLamp}>
              <StatusLamp {...runLamp(run)} />
            </div>
            <div className={styles.historyTime}>{timeAgo(run.finishedAt)}</div>
            <div className={styles.historyStats}>
              {run.stats.expected} passed · {run.stats.unexpected} failed
              {run.healed ? ` · ${run.healingEvents.length} locator(s) self-healed` : ''}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
