// REST control points for Phase 12 debug sessions (see PLAN.md's gated "In-app AI debug
// terminal"). Starting/submitting/discarding a session are normal authenticated request/response
// calls; the live PTY channel itself is the separate websocket in
// debugSession/websocketHandler.ts — same split Phase 6 already established for its own
// recording session.
import type { Request, Response, Router as RouterType } from 'express';
import type { TestsStore } from '../storage/testsStore';
import type { RunsStore } from '../storage/runsStore';
import type { DebugSessionDiffsStore } from '../storage/debugSessionDiffsStore';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sha256 } = require('../storage/debugSessionDiffsStore.ts');
const { isCommittedAtHead } = require('../debugSession/worktree.ts');

export interface DebugSessionsRouterDeps {
  repoRoot: string;
  testsStore: TestsStore;
  runsStore: RunsStore;
  debugSessionDiffsStore: DebugSessionDiffsStore;
  debugSessionManager: any;
}

function manifestPathForSpecRelative(specPath: string): string {
  const base = path.basename(specPath, '.spec.ts');
  return path.join('manifests', `${base}.json`);
}

function buildSeedPrompt(specPath: string, run: { stats: { unexpected: number; expected: number } }): string {
  return (
    `The Playwright test at ${specPath} just failed (${run.stats.unexpected} failed, ` +
    `${run.stats.expected} passed). You have shell access to this file and its manifest/support ` +
    `files only. Investigate the failure and propose a fix — do not run destructive commands.`
  );
}

function createDebugSessionsRouter({
  repoRoot,
  testsStore,
  runsStore,
  debugSessionDiffsStore,
  debugSessionManager,
}: DebugSessionsRouterDeps): RouterType {
  const router = require('express').Router();

  router.post('/debug-sessions', (req: Request, res: Response) => {
    const { testId, runId } = req.body ?? {};
    const test = typeof testId === 'string' ? testsStore.get(testId) : undefined;
    if (!test) return res.status(404).json({ error: 'test not found' });

    const run = typeof runId === 'string' ? runsStore.get(runId) : undefined;
    if (!run || run.testId !== testId) return res.status(404).json({ error: 'run not found for this test' });
    if (run.status !== 'failed') {
      return res.status(400).json({ error: 'a debug session can only be opened for a failed run' });
    }
    if (!isCommittedAtHead(repoRoot, test.specPath)) {
      return res.status(400).json({
        error: `${test.specPath} isn't committed yet — a debug session's worktree only sees committed ` +
          'history, so commit this spec (and its manifest) before opening one.',
      });
    }

    let session;
    try {
      session = debugSessionManager.start({
        testId,
        specPath: test.specPath,
        manifestPath: manifestPathForSpecRelative(test.specPath),
        seedPrompt: buildSeedPrompt(test.specPath, run),
      });
    } catch (err: any) {
      if (err?.message === 'CONCURRENCY_LIMIT') {
        return res.status(429).json({ error: 'Too many debug sessions in progress — try again shortly.' });
      }
      return res.status(502).json({ error: `Could not start debug session: ${err?.message ?? err}` });
    }

    const token = debugSessionManager.mintToken(session.id);
    res.status(201).json({ sessionId: session.id, token, wsPath: `/ws/debug-sessions/${session.id}?token=${token}` });
  });

  router.post('/debug-sessions/:id/submit', (req: Request<{ id: string }>, res: Response) => {
    const session = debugSessionManager.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'debug session not found' });

    const { diff, files } = session.captureDiff();
    if (!diff || files.length === 0) {
      return res.status(400).json({ error: 'no changes to submit' });
    }

    const baseHashes: Record<string, string> = {};
    for (const file of files) {
      const absPath = path.join(repoRoot, file);
      baseHashes[file] = fs.existsSync(absPath) ? sha256(fs.readFileSync(absPath, 'utf8')) : '';
    }

    const record = debugSessionDiffsStore.add({
      testId: session.testId,
      sessionId: session.id,
      worktreePath: session.worktreePath,
      diff,
      files,
      baseHashes,
    });

    debugSessionManager.dispose(req.params.id);
    res.status(201).json(record);
  });

  router.post('/debug-sessions/:id/discard', (req: Request<{ id: string }>, res: Response) => {
    const session = debugSessionManager.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'debug session not found' });
    debugSessionManager.dispose(req.params.id);
    res.status(204).end();
  });

  router.get('/debug-sessions/:id/audit-log', (req: Request<{ id: string }>, res: Response) => {
    const session = debugSessionManager.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'debug session not found' });
    res.json({ entries: session.readAuditLog() });
  });

  router.get('/debug-session-diffs', (req: Request, res: Response) => {
    const status = req.query.status as any;
    res.json(debugSessionDiffsStore.list(status));
  });

  router.patch('/debug-session-diffs/:id', (req: Request<{ id: string }>, res: Response) => {
    const { status } = req.body ?? {};
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const record = debugSessionDiffsStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'debug session diff not found' });
    if (record.status !== 'pending') {
      return res.status(409).json({ error: `diff was already ${record.status}` });
    }

    if (status === 'approved') {
      for (const file of record.files) {
        const absPath = path.join(repoRoot, file);
        const currentHash = fs.existsSync(absPath) ? sha256(fs.readFileSync(absPath, 'utf8')) : '';
        if (currentHash !== record.baseHashes[file]) {
          return res
            .status(409)
            .json({ error: `${file} changed since this diff was captured — discard and retry` });
        }
      }
      try {
        execFileSync('git', ['apply', '--whitespace=nowarn'], { cwd: repoRoot, input: record.diff });
      } catch (err: any) {
        return res.status(409).json({ error: `could not apply diff: ${err?.message ?? err}` });
      }
    }

    const updated = debugSessionDiffsStore.update(req.params.id, status);
    res.json(updated);
  });

  return router;
}

module.exports = { createDebugSessionsRouter };
