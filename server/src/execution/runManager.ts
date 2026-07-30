// Run concurrency cap (Phase 7) — mirrors server/src/recording/sessionManager.ts's
// cap-plus-sentinel-error pattern. runner.ts's execFile is no longer synchronous, so nothing
// else stopped N simultaneous `POST /tests/:id/runs` calls from spawning N parallel Chromium
// processes; this closes that gap the same way recording sessions already do.
const MAX_CONCURRENT_RUNS = 2;

class RunManager {
  private active = 0;

  start(): void {
    if (this.active >= MAX_CONCURRENT_RUNS) {
      throw new Error('CONCURRENCY_LIMIT');
    }
    this.active += 1;
  }

  finish(): void {
    this.active = Math.max(0, this.active - 1);
  }

  activeCount(): number {
    return this.active;
  }
}

module.exports = { RunManager, MAX_CONCURRENT_RUNS };
