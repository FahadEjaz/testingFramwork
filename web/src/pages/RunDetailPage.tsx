import { useEffect, useRef, useState } from 'react';
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!credentials || !runId) return;
    getRun(credentials, runId).then(setRun);
  }, [credentials, runId]);

  // Playwright's own report's "View Trace" link is a plain same-window anchor with no `target`
  // at all — clicking it navigates the iframe itself in place (confirmed by inspecting the real
  // DOM, not assumed from the bundle's minified source). A couple of other spots (the trace
  // viewer's own screenshot-popout button) do call window.open(url, "_blank") directly, with no
  // size — so either way, nothing here already opens as a new, maximized window. We don't own
  // this bundled report (it's regenerated fresh by Playwright on every run, so patching the
  // generated file directly would be wiped out next run) — instead, once our iframe (same-origin)
  // finishes loading, intercept the navigation ourselves and re-open it via window.open with
  // explicit width/height set to the full screen, the closest a web page can get to "always open
  // maximized" (there's no "maximized" flag in the window.open features string).
  function handleReportLoad() {
    const win = iframeRef.current?.contentWindow;
    const doc = win?.document;
    if (!win || !doc) return;

    // Captured before win.open is overridden below, so openMaximized always calls the real
    // browser API — reusing win.open itself here would recurse into the override forever.
    const nativeOpen = win.open.bind(win);

    function openMaximized(url: string) {
      const w = win!.screen.width;
      const h = win!.screen.height;
      nativeOpen(url, '_blank', `width=${w},height=${h},left=0,top=0`);
    }

    doc.addEventListener(
      'click',
      (e) => {
        const anchor = (e.target as HTMLElement | null)?.closest('a');
        const href = anchor?.getAttribute('href');
        if (!href) return;
        // The trace viewer entry point specifically (what "View Trace" links to), or anything
        // the report itself already marked target="_blank" (e.g. a screenshot popout) — anything
        // else (in-report SPA links, "View video", etc.) keeps its normal in-place navigation.
        const isTraceLink = href.includes('/trace/index.html');
        const isNewWindowLink = anchor?.getAttribute('target') === '_blank';
        if (!isTraceLink && !isNewWindowLink) return;
        e.preventDefault();
        e.stopPropagation();
        openMaximized(new URL(href, win.location.href).toString());
      },
      true
    );

    // The trace viewer's own screenshot-popout button calls window.open() directly rather than
    // rendering a link — override it too so that path also opens maximized. Re-applied on every
    // load, since navigating the iframe to trace/index.html is a real page load with its own
    // fresh `window` object, not an in-place SPA route change.
    win.open = ((url?: string | URL) => {
      if (url) openMaximized(url.toString());
      return null;
    }) as typeof win.open;
  }

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
        <iframe
          ref={iframeRef}
          className={styles.reportFrame}
          src={reportUrl(run.id)}
          title="Playwright report"
          onLoad={handleReportLoad}
        />
      ) : (
        <div className={styles.empty}>No report was generated for this run.</div>
      )}
    </div>
  );
}
