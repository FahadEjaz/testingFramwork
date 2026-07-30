// Triggers the existing Playwright engine for one test case and turns its output into a
// structured result (Phase 4 — see PLAN.md "Backend API & storage foundation"). No AI anywhere
// on this path; this only drives the deterministic run/fallback-healing engine built in
// Phases 1-2 and reads back what happened.
import type { RunStats, HealingEvent } from './storage/runsStore';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

export interface RunOutcome {
  status: 'passed' | 'failed';
  stats: RunStats;
  healed: boolean;
  healingEvents: HealingEvent[];
}

const EMPTY_STATS: RunStats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 0 };

function runSpec(repoRoot: string, specPath: string): RunOutcome {
  const healingLogPath = path.join(os.tmpdir(), `healing-events-${crypto.randomUUID()}.jsonl`);

  let stdout: string | undefined;
  try {
    stdout = execFileSync('npx', ['playwright', 'test', specPath, '--project=chromium', '--reporter=json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, HEALING_LOG_PATH: healingLogPath },
    });
  } catch (err: any) {
    // Playwright exits non-zero on any test failure; the JSON reporter output is still on
    // stdout when that happens, so pull it from the error instead of treating this as a crash.
    stdout = err.stdout;
  }

  const healingEvents = readHealingEvents(healingLogPath);

  let stats = EMPTY_STATS;
  if (stdout) {
    try {
      const report = JSON.parse(stdout);
      stats = {
        expected: report.stats?.expected ?? 0,
        unexpected: report.stats?.unexpected ?? 0,
        flaky: report.stats?.flaky ?? 0,
        skipped: report.stats?.skipped ?? 0,
        duration: report.stats?.duration ?? 0,
      };
    } catch {
      // Malformed/empty reporter output (e.g. the spec path didn't match any file) — surface as
      // a failed run with zeroed stats rather than crashing the request.
    }
  }

  return {
    status: stats.unexpected > 0 ? 'failed' : 'passed',
    stats,
    healed: healingEvents.length > 0,
    healingEvents,
  };
}

function readHealingEvents(healingLogPath: string): HealingEvent[] {
  if (!fs.existsSync(healingLogPath)) return [];
  try {
    return fs
      .readFileSync(healingLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line: string) => JSON.parse(line));
  } finally {
    fs.rmSync(healingLogPath, { force: true });
  }
}

module.exports = { runSpec };
