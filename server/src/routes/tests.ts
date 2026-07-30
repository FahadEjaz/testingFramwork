// list/create/rename/delete test cases + trigger a run + fetch its results (Phase 4).
import type { Request, Response, Router as RouterType } from 'express';
import type { TestsStore } from '../storage/testsStore';
import type { RunsStore } from '../storage/runsStore';
import type { RunOutcome } from '../runner';

const express = require('express');
const fs = require('fs');
const path = require('path');
const defaultRunSpec = require('../runner.ts').runSpec;

export interface TestsRouterDeps {
  repoRoot: string;
  testsStore: TestsStore;
  runsStore: RunsStore;
  // Overridable so route logic (validation, storage wiring) can be tested without spawning a
  // real Playwright process — defaults to the real engine in production.
  runSpec?: (repoRoot: string, specPath: string) => RunOutcome;
}

function createTestsRouter({
  repoRoot,
  testsStore,
  runsStore,
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

  router.post('/tests/:id/runs', (req: Request<{ id: string }>, res: Response) => {
    const test = testsStore.get(req.params.id);
    if (!test) return res.status(404).json({ error: 'test case not found' });

    const startedAt = new Date().toISOString();
    const outcome = runSpec(repoRoot, test.specPath);
    const finishedAt = new Date().toISOString();

    const run = runsStore.create({ testId: test.id, startedAt, finishedAt, ...outcome });
    res.status(201).json(run);
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
