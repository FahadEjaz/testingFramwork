import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRun, reportUrl } from '../api';
import { useAuth } from '../auth/AuthContext';
import { StatusLamp } from '../components/StatusLamp';
import { formatLocator, runLamp, timeAgo } from '../lib/runStatus';
import type { Run } from '../types';
import styles from './RunDetailPage.module.css';

export function RunDetailPage() {
  const { testId, runId } = useParams<{ testId: string; runId: string }>();
  const { credentials } = useAuth();
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    if (!credentials || !runId) return;
    getRun(credentials, runId).then(setRun);
  }, [credentials, runId]);

  if (!run) return null;

  return (
    <div>
      <Link className={styles.back} to={`/tests/${testId}`}>
        &lsaquo; Back to test
      </Link>

      <div className={styles.header}>
        <h1>Run details</h1>
        <StatusLamp {...runLamp(run)} />
      </div>

      <div className={styles.meta}>
        {timeAgo(run.finishedAt)} · {run.stats.expected} passed · {run.stats.unexpected} failed
        {run.stats.flaky > 0 ? ` · ${run.stats.flaky} flaky` : ''}
        {run.stats.skipped > 0 ? ` · ${run.stats.skipped} skipped` : ''}
      </div>

      {run.healed && (
        <>
          <h3 className={styles.sectionLabel}>Self-healed locators</h3>
          <div className={styles.list}>
            {run.healingEvents.map((event, i) => (
              <div className={styles.card} key={i}>
                <div className={styles.cardTop}>
                  <div className={styles.cardTitle}>{event.elementKey}</div>
                  <StatusLamp tone="healed" label={event.source === 'ai' ? 'AI-healed' : 'Fallback-healed'} />
                </div>
                <div className={styles.diff}>
                  <span className={styles.diffOld}>− {formatLocator(event.oldPrimary)}</span>
                  <span className={styles.diffNew}>+ {formatLocator(event.newPrimary)}</span>
                </div>
                {event.tokensUsed && (
                  <div className={styles.tokens}>
                    {event.tokensUsed.inputTokens} in / {event.tokensUsed.outputTokens} out tokens
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className={styles.sectionLabel}>Report</h3>
      {run.reportAvailable ? (
        <iframe className={styles.reportFrame} src={reportUrl(run.id)} title="Playwright report" />
      ) : (
        <div className={styles.empty}>No report was generated for this run.</div>
      )}
    </div>
  );
}
