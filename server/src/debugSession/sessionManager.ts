// Lifecycle manager for Phase 12 debug sessions — concurrency cap, idle sweep, one active session
// per test, and capability-token mint/consume for the websocket handshake (see PLAN.md's gated
// "In-app AI debug terminal" for the numbers below and why they're grounded against Phase 6/7's
// own concurrency caps).
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const { DebugSession } = require('./session.ts');
const worktree = require('./worktree.ts');

// Heavier per-session cost than a recording tab (a whole container, not just a headless browser
// tab) — parity with Phase 7's run concurrency (MAX_CONCURRENT_RUNS = 2), not Phase 6's recording
// concurrency (3).
const MAX_CONCURRENT_SESSIONS = 2;
// More think-time than active mouse-dragging (Phase 6's 5 min) — a human reading/editing code
// interactively takes longer between actions than driving a recording.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

class DebugSessionManager {
  private sessions = new Map<string, any>();
  private tokens = new Map<string, { sessionId: string; expiresAt: number }>();
  private testIdInUse = new Map<string, string>(); // testId -> sessionId
  private sweepTimer: NodeJS.Timeout;
  private repoRoot: string;
  private dataDir: string;

  constructor(repoRoot: string, dataDir: string) {
    this.repoRoot = repoRoot;
    this.dataDir = dataDir;
    this.sweepTimer = setInterval(() => this.sweepIdle(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  activeCount(): number {
    // A freshly-created session sits in 'starting' until its websocket actually connects and
    // spawns the container (session.start()) — counting only 'live' would let the cap be
    // bypassed by sessions nobody has opened a terminal for yet, same bug this project's own
    // Phase 6 sessionManager.ts already avoids with the equivalent `!== 'stopped'` check.
    return [...this.sessions.values()].filter((s) => s.status !== 'stopped').length;
  }

  // Boot-time cleanup for containers/worktrees a prior server process left behind (crash, kill
  // -9) — best-effort: capture whatever diff is still salvageable before removing each one, same
  // "salvage or discard" bar PLAN.md's Phase 12 bullet describes.
  sweepOrphans(diffsStore: any): void {
    let containerIds: string[] = [];
    try {
      const out = execFileSync('docker', [
        'ps',
        '-a',
        '--filter',
        'label=com.testingframework.debug-session',
        '--format',
        '{{.Names}}',
      ]).toString();
      containerIds = out.split('\n').filter(Boolean);
    } catch {
      // docker not available in this environment — nothing to sweep.
    }
    for (const name of containerIds) {
      try {
        execFileSync('docker', ['rm', '-f', name]);
      } catch {
        // already gone
      }
    }

    for (const wtPath of worktree.listOrphanedWorktrees(this.repoRoot)) {
      try {
        const diff = worktree.getDiff(wtPath);
        const files = worktree.getTouchedFiles(wtPath);
        if (diff && files.length > 0) {
          console.warn(
            `Orphaned debug-session worktree at ${wtPath} had uncommitted changes — captured as a` +
            ' pending diff review rather than discarded silently.'
          );
          diffsStore?.add({
            testId: 'unknown',
            sessionId: path.basename(wtPath),
            worktreePath: wtPath,
            diff,
            files,
            baseHashes: {},
          });
        }
      } catch {
        // best-effort
      }
      worktree.teardown(this.repoRoot, wtPath);
    }
  }

  // Idempotent by testId: if one's already open, hand back the *same* session (a fresh
  // capability token still gets minted by the route layer either way) rather than refusing.
  // Originally this threw SESSION_ALREADY_ACTIVE_FOR_TEST instead — caught live in this session's
  // own browser verification that this was a real dead-end: React StrictMode's dev-mode
  // double-effect-invoke re-requested a session for the same test on remount and got permanently
  // 409-blocked with no way back in short of the 10-minute idle timeout. The exact same thing
  // would hit a real user on an accidental page refresh, not just a StrictMode artifact — the
  // fix is correct regardless of environment, not a StrictMode workaround.
  start(params: { testId: string; specPath: string; manifestPath: string; seedPrompt: string }): any {
    const existingId = this.testIdInUse.get(params.testId);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) return existing;
      this.testIdInUse.delete(params.testId); // stale mapping — the session it pointed to is gone
    }
    if (this.activeCount() >= MAX_CONCURRENT_SESSIONS) {
      throw new Error('CONCURRENCY_LIMIT');
    }

    const id = crypto.randomUUID();
    const worktreePath = worktree.createWorktree(this.repoRoot, id, params.specPath, params.manifestPath);
    const auditLogPath = path.join(this.dataDir, 'debug-sessions', `${id}.jsonl`);

    const session = new DebugSession(id, params.testId, worktreePath, params.seedPrompt, auditLogPath, Date.now());
    this.sessions.set(id, session);
    this.testIdInUse.set(params.testId, id);
    return session;
  }

  get(id: string): any {
    return this.sessions.get(id);
  }

  mintToken(sessionId: string): string {
    const token = crypto.randomUUID();
    this.tokens.set(token, { sessionId, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }

  // Single-use: deleted on first lookup regardless of outcome, so a captured/replayed token can
  // never be presented twice — stricter than Phase 6's recording websocket, which only trusts
  // session-id possession (this grants shell execution, not screencast viewing).
  consumeToken(token: string): string | undefined {
    const entry = this.tokens.get(token);
    this.tokens.delete(token);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) return undefined;
    return entry.sessionId;
  }

  stop(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.stop();
  }

  // Full teardown — stops the container/pty if still running and removes the worktree. Called
  // once a diff has been submitted for review (or explicitly discarded); a stopped-but-not-yet-
  // submitted session's worktree is deliberately left in place so its diff can still be captured
  // late, mirroring Phase 6's STOPPED_GRACE_MS idea.
  dispose(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.stop();
    worktree.teardown(this.repoRoot, session.worktreePath);
    this.sessions.delete(id);
    if (this.testIdInUse.get(session.testId) === id) {
      this.testIdInUse.delete(session.testId);
    }
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status === 'live' && now - session.lastActivityAt > IDLE_TIMEOUT_MS) {
        this.dispose(id);
      }
    }
    for (const [token, entry] of this.tokens) {
      if (now > entry.expiresAt) this.tokens.delete(token);
    }
  }
}

module.exports = { DebugSessionManager, MAX_CONCURRENT_SESSIONS, IDLE_TIMEOUT_MS, TOKEN_TTL_MS };
