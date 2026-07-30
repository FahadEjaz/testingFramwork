// Recording session lifecycle: start, concurrency cap, idle timeout, cleanup on disconnect
// (Phase 6 — see PLAN.md "Session lifecycle" bullet).
import type { RecordedAction } from './session';

const crypto = require('crypto');
const { RecordingSession } = require('./session.ts');

const MAX_CONCURRENT_SESSIONS = 3;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
// A session that was stopped (browser closed, actions captured) but never saved — the user
// closed the tab mid-preview, say — is kept around so a late /save can still succeed, but not
// forever.
const STOPPED_GRACE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

class SessionManager {
  private sessions = new Map<string, any>();
  private stoppedAt = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepIdle(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  activeCount(): number {
    return [...this.sessions.values()].filter((s) => s.status !== 'stopped').length;
  }

  async start(url: string): Promise<any> {
    if (this.activeCount() >= MAX_CONCURRENT_SESSIONS) {
      throw new Error('CONCURRENCY_LIMIT');
    }
    const id = crypto.randomUUID();
    const session = new RecordingSession(id, url, Date.now());
    this.sessions.set(id, session);
    try {
      await session.start();
    } catch (err) {
      this.sessions.delete(id);
      throw err;
    }
    return session;
  }

  get(id: string): any {
    return this.sessions.get(id);
  }

  // Stops the browser/screencast but keeps the session (and its recorded actions) addressable
  // by id until save() or dispose() — see STOPPED_GRACE_MS.
  async stop(id: string): Promise<RecordedAction[] | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const actions = await session.stop();
    this.stoppedAt.set(id, Date.now());
    return actions;
  }

  async dispose(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.stop();
    this.sessions.delete(id);
    this.stoppedAt.delete(id);
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status === 'live' && now - session.lastActivityAt > IDLE_TIMEOUT_MS) {
        this.dispose(id).catch(() => {});
        continue;
      }
      const stoppedAt = this.stoppedAt.get(id);
      if (stoppedAt && now - stoppedAt > STOPPED_GRACE_MS) {
        this.dispose(id).catch(() => {});
      }
    }
  }
}

module.exports = { SessionManager, MAX_CONCURRENT_SESSIONS };
