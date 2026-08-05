import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ApiError, discardDebugSession, startDebugSession, submitDebugSession } from '../api';
import { useAuth } from '../auth/AuthContext';
import styles from './DebugSessionPage.module.css';

type Phase = 'connecting' | 'live' | 'ended' | 'error';

// Phase 12 spike (gated behind an explicit product decision — see REQUIREMENTS.md non-negotiable
// #2 and PLAN.md's own sign-off gate for this phase). A live `claude` CLI session, scoped to the
// failing test's own worktree, running inside a locked-down container — see
// server/src/debugSession/ for the isolation this terminal is just a thin window onto. Nothing
// here touches the real checkout directly; Submit only *queues* a diff for a separate,
// human-only Approve/Reject review (DebugSessionDiffsPage).
export function DebugSessionPage() {
  const { testId, runId } = useParams<{ testId: string; runId: string }>();
  const { credentials } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const cleanupResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!credentials || !testId || !runId) return;
    let cancelled = false;

    async function connect() {
      try {
        const { sessionId, wsPath } = await startDebugSession(credentials!, testId!, runId!);
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        openTerminal(wsPath);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not open a debug session — check that this run actually failed and try again.'
        );
        setPhase('error');
      }
    }

    function openTerminal(wsPath: string) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'var(--mono, ui-monospace, monospace)',
        fontSize: 13,
        theme: { background: '#1b1d22', foreground: '#eafff8', cursor: '#eafff8' },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      if (containerRef.current) term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}${wsPath}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setPhase('live');
        term.focus();
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'data') term.write(message.data);
        else if (message.type === 'exit') {
          term.write('\r\n\r\n[session ended]\r\n');
          setPhase('ended');
        }
      };

      ws.onclose = () => setPhase((p) => (p === 'live' ? 'ended' : p));

      // Raw keystrokes forwarded as-is — including the human pressing Enter themselves on the
      // seeded prompt (server/src/debugSession/session.ts writes it un-submitted on purpose; this
      // terminal doesn't need to do anything special for that, the human's own Enter is what
      // finally sends it).
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ kind: 'input', data }));
      });

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ kind: 'resize', cols, rows }));
      });

      const handleWindowResize = () => fitAddon.fit();
      window.addEventListener('resize', handleWindowResize);
      cleanupResizeRef.current = () => window.removeEventListener('resize', handleWindowResize);
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      cleanupResizeRef.current?.();
      termRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, testId, runId]);

  async function handleSubmit() {
    if (!credentials || !sessionIdRef.current) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDebugSession(credentials, sessionIdRef.current);
      wsRef.current?.close();
      navigate('/debug-diffs');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit this session for review.');
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    if (!credentials || !sessionIdRef.current) return;
    setDiscarding(true);
    try {
      await discardDebugSession(credentials, sessionIdRef.current);
      wsRef.current?.close();
      navigate(`/tests/${testId}/runs/${runId}`);
    } catch {
      setDiscarding(false);
    }
  }

  if (phase === 'error') {
    return (
      <div>
        <Link className={styles.back} to={`/tests/${testId}/runs/${runId}`}>
          &lsaquo; Back to run
        </Link>
        <h1>Debug Session</h1>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <Link className={styles.back} to={`/tests/${testId}/runs/${runId}`}>
        &lsaquo; Back to run
      </Link>

      <div className={styles.header}>
        <h1>Debug Session</h1>
        <div className={styles.actions}>
          <button className={styles.discardButton} onClick={handleDiscard} disabled={discarding || phase === 'connecting'} type="button">
            {discarding ? 'Discarding…' : 'Discard'}
          </button>
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={submitting || phase === 'connecting'}
            type="button"
          >
            {submitting ? 'Submitting…' : 'Submit for Review'}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.notice}>
        This runs `claude` with shell access to this test's own files only, inside a locked-down
        sandbox — nothing it does touches the real files until you Submit and a human separately
        approves the diff. Avoid pasting real credentials or personal data into the terminal.
      </p>

      <div className={styles.terminalWrap}>
        <div ref={containerRef} className={styles.terminal} />
        {phase === 'connecting' && <div className={styles.overlay}>Starting session…</div>}
        {phase === 'ended' && <div className={styles.overlay}>Session ended — Submit or Discard above.</div>}
      </div>
    </div>
  );
}
