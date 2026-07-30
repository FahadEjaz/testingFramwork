// list/create/rename/delete test cases + trigger a run + fetch its results (Phase 4; run
// artifacts/concurrency cap added in Phase 7).
import type { Request, Response, Router as RouterType } from 'express';
import type { TestsStore } from '../storage/testsStore';
import type { RunsStore } from '../storage/runsStore';
import type { PendingFixesStore } from '../storage/pendingFixesStore';
import type { RunOutcome } from '../runner';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaultRunSpec = require('../runner.ts').runSpec;
const { RunManager } = require('../execution/runManager.ts');

export interface TestsRouterDeps {
  repoRoot: string;
  dataDir: string;
  testsStore: TestsStore;
  runsStore: RunsStore;
  pendingFixesStore: PendingFixesStore;
  runManager?: { start(): void; finish(): void };
  // Overridable so route logic (validation, storage wiring) can be tested without spawning a
  // real Playwright process — defaults to the real engine in production.
  runSpec?: (repoRoot: string, dataDir: string, specPath: string, runId: string) => Promise<RunOutcome>;
}

function createTestsRouter({
  repoRoot,
  dataDir,
  testsStore,
  runsStore,
  pendingFixesStore,
  runManager = new RunManager(),
  runSpec = defaultRunSpec,
}: TestsRouterDeps): RouterType {
  const router = express.Router();

  router.get('/tests', (_req: Request, res: Response) => {
    res.json(testsStore.list());
  });

  router.post('/tests', (req: Request, res: Response) => {
    const { name, specPath } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (typeof specPath !== 'string' || !specPath.endsWith('.spec.ts')) {
      return res.status(400).json({ error: 'specPath must be a path to a .spec.ts file' });
    }

    const resolved = path.resolve(repoRoot, specPath);
    if (!resolved.startsWith(repoRoot + path.sep) || !fs.existsSync(resolved)) {
      return res.status(400).json({ error: `specPath does not exist: ${specPath}` });
    }
    if (testsStore.findBySpecPath(specPath)) {
      return res.status(409).json({ error: `a test case already tracks ${specPath}` });
    }

    res.status(201).json(testsStore.create({ name: name.trim(), specPath }));
  });

  router.patch('/tests/:id', (req: Request<{ id: string }>, res: Response) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const updated = testsStore.rename(req.params.id, name.trim());
    if (!updated) return res.status(404).json({ error: 'test case not found' });
    res.json(updated);
  });

  router.delete('/tests/:id', (req: Request<{ id: string }>, res: Response) => {
    const removed = testsStore.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'test case not found' });
    res.status(204).end();
  });

  router.post('/tests/:id/runs', async (req: Request<{ id: string }>, res: Response) => {
    const test = testsStore.get(req.params.id);
    if (!test) return res.status(404).json({ error: 'test case not found' });

    try {
      runManager.start();
    } catch (err: any) {
      if (err?.message === 'CONCURRENCY_LIMIT') {
        return res.status(429).json({ error: 'Too many runs in progress — try again shortly.' });
      }
      throw err;
    }

    try {
      const runId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const outcome = await runSpec(repoRoot, dataDir, test.specPath, runId);
      const finishedAt = new Date().toISOString();

      const run = runsStore.create({ id: runId, testId: test.id, startedAt, finishedAt, ...outcome });
      // Deterministic fallback-healing during this run (Phase 2's resolver, reused as-is) queues
      // a Pending Fix per healed element instead of the old git-branch/PR flow — see PLAN.md
      // Phase 8. The run that triggered it already used the healed locator, so it doesn't fail.
      if (outcome.healingEvents.length > 0) {
        pendingFixesStore.recordHealing(test.id, outcome.healingEvents, 'fallback');
      }
      res.status(201).json(run);
    } finally {
      runManager.finish();
    }
  });

  router.get('/tests/:id/runs', (req: Request<{ id: string }>, res: Response) => {
    const test = testsStore.get(req.params.id);
    if (!test) return res.status(404).json({ error: 'test case not found' });
    res.json(runsStore.listForTest(test.id));
  });

  router.get('/runs/:runId', (req: Request<{ runId: string }>, res: Response) => {
    const run = runsStore.get(req.params.runId);
    if (!run) return res.status(404).json({ error: 'run not found' });
    res.json(run);
  });

  return router;
}

module.exports = { createTestsRouter };
