// Triggers the existing Playwright engine for one test case and turns its output into a
// structured result (Phase 4 — see PLAN.md "Backend API & storage foundation"; artifact capture
// added in Phase 7, "One-click execution & reporting"). No AI anywhere on this path; this only
// drives the deterministic run/fallback-healing engine built in Phases 1-2 and reads back what
// happened.
import type { RunStats, HealingEvent } from './storage/runsStore';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

export interface RunOutcome {
  status: 'passed' | 'failed';
  stats: RunStats;
  healed: boolean;
  healingEvents: HealingEvent[];
  reportAvailable: boolean;
}

const EMPTY_STATS: RunStats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 0 };

// runId names the per-run artifact directories under <dataDir>/runs/<runId>/ — passed in by the
// caller (rather than generated here) so it can match the id runsStore.create() ends up stamping
// on the persisted Run record, keeping "where are this run's artifacts" a pure function of the
// run's own id instead of a separately-stored path.
async function runSpec(repoRoot: string, dataDir: string, specPath: string, runId: string): Promise<RunOutcome> {
  const runDir = path.join(dataDir, 'runs', runId);
  const outputDir = path.join(runDir, 'test-results');
  const reportDir = path.join(runDir, 'report');
  const healingLogPath = path.join(os.tmpdir(), `healing-events-${crypto.randomUUID()}.jsonl`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  let stdout: string | undefined;
  try {
    const result = await execFileAsync(
      'npx',
      ['playwright', 'test', specPath, '--project=chromium', '--config=playwright.execution.config.ts'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 50 * 1024 * 1024,
        env: {
          ...process.env,
          HEALING_LOG_PATH: healingLogPath,
          PW_RUN_OUTPUT_DIR: outputDir,
          PW_RUN_REPORT_DIR: reportDir,
        },
      }
    );
    stdout = result.stdout;
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
    reportAvailable: fs.existsSync(path.join(reportDir, 'index.html')),
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
