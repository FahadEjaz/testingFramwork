// Start/stop/save a recording session (Phase 6). The live screencast/input channel itself is a
// websocket (see server/src/recording/websocketHandler.ts) — these are just the REST control
// points around it.
import type { Request, Response, Router as RouterType } from 'express';
import type { TestsStore } from '../storage/testsStore';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { generateTest } = require('../recording/codegen.ts');

export interface RecordingsRouterDeps {
  repoRoot: string;
  testsStore: TestsStore;
  sessionManager: any;
}

function isRecordableUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createRecordingsRouter({ repoRoot, testsStore, sessionManager }: RecordingsRouterDeps): RouterType {
  const router = express.Router();

  router.post('/recordings', async (req: Request, res: Response) => {
    const { url } = req.body ?? {};
    if (!isRecordableUrl(url)) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }

    try {
      const session = await sessionManager.start(url);
      res.status(201).json({ sessionId: session.id, wsPath: `/ws/recordings/${session.id}` });
    } catch (err: any) {
      if (err?.message === 'CONCURRENCY_LIMIT') {
        return res.status(429).json({ error: 'Too many recording sessions in progress — try again shortly.' });
      }
      res.status(502).json({ error: `Could not start a recording session: ${err?.message ?? err}` });
    }
  });

  router.post('/recordings/:id/stop', async (req: Request<{ id: string }>, res: Response) => {
    const actions = await sessionManager.stop(req.params.id);
    if (!actions) return res.status(404).json({ error: 'recording session not found' });
    res.json({ actions });
  });

  router.post('/recordings/:id/save', async (req: Request<{ id: string }>, res: Response) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const session = sessionManager.get(req.params.id);
    if (!session || session.status !== 'stopped') {
      return res.status(404).json({ error: 'no stopped recording session with that id — call stop first' });
    }

    const generated = generateTest(name.trim(), session.startUrl, session.getActions());

    const absSpecPath = path.join(repoRoot, generated.specPath);
    const absManifestPath = path.join(repoRoot, generated.manifestPath);
    if (fs.existsSync(absSpecPath)) {
      return res.status(409).json({ error: `${generated.specPath} already exists — rename and try again` });
    }

    fs.mkdirSync(path.dirname(absSpecPath), { recursive: true });
    fs.writeFileSync(absSpecPath, generated.specSource);
    fs.mkdirSync(path.dirname(absManifestPath), { recursive: true });
    fs.writeFileSync(absManifestPath, `${JSON.stringify(generated.manifest, null, 2)}\n`);

    const test = testsStore.create({ name: name.trim(), specPath: generated.specPath });
    await sessionManager.dispose(req.params.id);
    res.status(201).json(test);
  });

  return router;
}

module.exports = { createRecordingsRouter };
