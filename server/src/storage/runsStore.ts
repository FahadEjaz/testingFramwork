// File-backed store for run results (Phase 4 — see PLAN.md). One JSON file per run under
// <dataDir>/runs/, plus an index file so listing/filtering by test doesn't need to read every
// run file.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export interface HealingEvent {
  spec: string;
  elementKey: string;
  oldPrimary: unknown;
  newPrimary: unknown;
  fallbackIndex: number;
  timestamp: string;
}

export interface RunStats {
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  duration: number;
}

export interface Run {
  id: string;
  testId: string;
  status: 'passed' | 'failed';
  stats: RunStats;
  healed: boolean;
  healingEvents: HealingEvent[];
  startedAt: string;
  finishedAt: string;
  // Whether an HTML report was written to <dataDir>/runs/<id>/report/ (Phase 7). The directory
  // name is always the run's own id, so no path needs to be stored — just whether it's there.
  reportAvailable: boolean;
}

export interface RunsStore {
  get(id: string): Run | undefined;
  listForTest(testId: string): Run[];
  // id is optional so callers that already minted a run id (Phase 7's runner.ts needs the id
  // before the run starts, to name its artifact directory) can make the stored record match it.
  create(run: Omit<Run, 'id'> & { id?: string }): Run;
}

function createRunsStore(dataDir: string): RunsStore {
  const runsDir = path.join(dataDir, 'runs');
  const indexPath = path.join(runsDir, 'index.json');

  function readIndex(): string[] {
    if (!fs.existsSync(indexPath)) return [];
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  function writeIndex(ids: string[]) {
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(indexPath, `${JSON.stringify(ids, null, 2)}\n`);
  }

  function runPath(id: string): string {
    return path.join(runsDir, `${id}.json`);
  }

  function get(id: string): Run | undefined {
    const filePath = runPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function listForTest(testId: string): Run[] {
    return readIndex()
      .map((id) => get(id))
      .filter((run): run is Run => Boolean(run) && run!.testId === testId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  function create(run: Omit<Run, 'id'> & { id?: string }): Run {
    const full: Run = { ...run, id: run.id ?? crypto.randomUUID() };
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(runPath(full.id), `${JSON.stringify(full, null, 2)}\n`);
    writeIndex([...readIndex(), full.id]);
    return full;
  }

  return { get, listForTest, create };
}

module.exports = { createRunsStore };
