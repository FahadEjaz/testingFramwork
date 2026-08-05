// Integration tests for Phase 12's REST surface (server/src/routes/debugSessions.ts). Docker/pty
// is never spawned here — that only happens when a websocket actually connects
// (debugSession/websocketHandler.ts calls session.start()) — so these exercise the worktree +
// diff-review logic against the real repo, with file edits made directly (simulating what a
// `claude` session would have written) rather than through a real container.
//
// approve() applies a real `git apply` against this repo's own live tests/smoke.spec.ts — every
// test that reaches that point restores the file's exact original bytes in a `finally`, so this
// suite never leaves the working tree dirty.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app.ts');

const repoRoot = path.resolve(__dirname, '..', '..');
const credentials = { username: 'tester', password: 'secret' };
const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
const jsonHeaders = { Authorization: authHeader, 'Content-Type': 'application/json' };
const SMOKE_SPEC_ABS = path.join(repoRoot, 'tests', 'smoke.spec.ts');

function withServer(fn: (ctx: { baseUrl: string; testsStore: any; runsStore: any }) => Promise<void>) {
  return async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-sessions-routes-test-'));
    const { app } = createApp({ repoRoot, dataDir, credentials, skipDebugSessionSweep: true });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    const { createTestsStore } = require('../src/storage/testsStore.ts');
    const { createRunsStore } = require('../src/storage/runsStore.ts');
    const testsStore = createTestsStore(dataDir);
    const runsStore = createRunsStore(dataDir);

    try {
      await fn({ baseUrl: `http://127.0.0.1:${port}`, testsStore, runsStore });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

function seedFailedRun(testsStore: any, runsStore: any) {
  const test = testsStore.create({ name: 'Smoke (debug-session test)', specPath: 'tests/smoke.spec.ts' });
  const run = runsStore.create({
    testId: test.id,
    status: 'failed',
    stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0, duration: 100 },
    healed: false,
    healingEvents: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    reportAvailable: false,
  });
  return { test, run };
}

test(
  'POST /api/debug-sessions requires auth',
  withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/debug-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId: 'x', runId: 'y' }),
    });
    assert.equal(res.status, 401);
  })
);

test(
  'POST /api/debug-sessions 404s for an unknown test, and 400s for a passed run',
  withServer(async ({ baseUrl, testsStore, runsStore }) => {
    const unknownTest = await fetch(`${baseUrl}/api/debug-sessions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ testId: 'does-not-exist', runId: 'does-not-exist' }),
    });
    assert.equal(unknownTest.status, 404);

    const test = testsStore.create({ name: 'Passing test', specPath: 'tests/smoke.spec.ts' });
    const passedRun = runsStore.create({
      testId: test.id,
      status: 'passed',
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 100 },
      healed: false,
      healingEvents: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      reportAvailable: false,
    });
    const res = await fetch(`${baseUrl}/api/debug-sessions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ testId: test.id, runId: passedRun.id }),
    });
    assert.equal(res.status, 400);
  })
);

test(
  "POST /api/debug-sessions 400s if the spec exists on disk but isn't committed",
  withServer(async ({ baseUrl, testsStore, runsStore }) => {
    // `git worktree add ... HEAD` only ever sees committed history — an uncommitted spec would
    // otherwise silently produce an empty worktree with no error at all (caught live in this
    // session's own browser verification). Registering a test only requires the file to exist on
    // disk (Phase 4), not that it's committed, so this gap is real, not contrived.
    const uncommittedSpecPath = 'tests/debug-session-uncommitted-fixture.spec.ts';
    const absPath = path.join(repoRoot, uncommittedSpecPath);
    fs.writeFileSync(absPath, "import { test } from '@playwright/test';\ntest.skip('placeholder', async () => {});\n");
    try {
      const test = testsStore.create({ name: 'Uncommitted fixture', specPath: uncommittedSpecPath });
      const run = runsStore.create({
        testId: test.id,
        status: 'failed',
        stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0, duration: 100 },
        healed: false,
        healingEvents: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        reportAvailable: false,
      });

      const res = await fetch(`${baseUrl}/api/debug-sessions`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ testId: test.id, runId: run.id }),
      });
      assert.equal(res.status, 400);
      const body: any = await res.json();
      assert.match(body.error, /isn't committed yet/);
    } finally {
      fs.rmSync(absPath, { force: true });
    }
  })
);

test(
  'full open -> edit -> submit -> approve applies the diff to the real file, then a duplicate decide 409s',
  withServer(async ({ baseUrl, testsStore, runsStore }) => {
    const originalContent = fs.readFileSync(SMOKE_SPEC_ABS, 'utf8');
    try {
      const { test, run } = seedFailedRun(testsStore, runsStore);

      const startRes = await fetch(`${baseUrl}/api/debug-sessions`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ testId: test.id, runId: run.id }),
      });
      assert.equal(startRes.status, 201);
      const { sessionId, token, wsPath }: any = await startRes.json();
      assert.ok(sessionId);
      assert.ok(token);
      assert.match(wsPath, /^\/ws\/debug-sessions\//);

      // A second request for the same (still-open) test reconnects to the *same* session — a
      // fresh token, not a fresh session — rather than refusing. Refusing here was the original
      // behavior; changed after this session's own browser verification hit it as a real dead
      // end on a page remount, with no way back in short of the idle timeout.
      const dupRes = await fetch(`${baseUrl}/api/debug-sessions`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ testId: test.id, runId: run.id }),
      });
      assert.equal(dupRes.status, 201);
      const dupBody: any = await dupRes.json();
      assert.equal(dupBody.sessionId, sessionId);
      assert.notEqual(dupBody.token, token, 'a reconnect should still mint its own fresh token');

      // Simulate a `claude` session editing the worktree's copy of the spec directly (no real
      // container needed to test this route's own logic).
      const worktreeSpecPath = path.join(repoRoot, '.debug-worktrees', sessionId, 'tests', 'smoke.spec.ts');
      fs.writeFileSync(worktreeSpecPath, `${fs.readFileSync(worktreeSpecPath, 'utf8')}\n// fixed by debug session\n`);

      const submitRes = await fetch(`${baseUrl}/api/debug-sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: jsonHeaders,
      });
      assert.equal(submitRes.status, 201);
      const diffRecord: any = await submitRes.json();
      assert.equal(diffRecord.status, 'pending');
      assert.deepEqual(diffRecord.files, ['tests/smoke.spec.ts']);
      assert.match(diffRecord.diff, /fixed by debug session/);

      // Submitting disposes the session — the same test id should be startable again immediately.
      assert.equal(fs.existsSync(path.join(repoRoot, '.debug-worktrees', sessionId)), false);

      const listRes = await fetch(`${baseUrl}/api/debug-session-diffs?status=pending`, { headers: jsonHeaders });
      const list: any = await listRes.json();
      assert.ok(list.some((d: any) => d.id === diffRecord.id));

      const approveRes = await fetch(`${baseUrl}/api/debug-session-diffs/${diffRecord.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(approveRes.status, 200);

      const patchedContent = fs.readFileSync(SMOKE_SPEC_ABS, 'utf8');
      assert.match(patchedContent, /fixed by debug session/);

      const reDecideRes = await fetch(`${baseUrl}/api/debug-session-diffs/${diffRecord.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'rejected' }),
      });
      assert.equal(reDecideRes.status, 409);
    } finally {
      fs.writeFileSync(SMOKE_SPEC_ABS, originalContent);
    }
  })
);

test(
  'approve refuses (409) if the live file changed since the diff was captured',
  withServer(async ({ baseUrl, testsStore, runsStore }) => {
    const originalContent = fs.readFileSync(SMOKE_SPEC_ABS, 'utf8');
    try {
      const { test, run } = seedFailedRun(testsStore, runsStore);
      const startRes = await fetch(`${baseUrl}/api/debug-sessions`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ testId: test.id, runId: run.id }),
      });
      const { sessionId }: any = await startRes.json();

      const worktreeSpecPath = path.join(repoRoot, '.debug-worktrees', sessionId, 'tests', 'smoke.spec.ts');
      fs.writeFileSync(worktreeSpecPath, `${fs.readFileSync(worktreeSpecPath, 'utf8')}\n// staleness test\n`);

      const submitRes = await fetch(`${baseUrl}/api/debug-sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: jsonHeaders,
      });
      const diffRecord: any = await submitRes.json();

      // The live file drifts after the diff was captured (someone else edited it in the meantime).
      fs.writeFileSync(SMOKE_SPEC_ABS, `${originalContent}\n// someone else's unrelated edit\n`);

      const approveRes = await fetch(`${baseUrl}/api/debug-session-diffs/${diffRecord.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(approveRes.status, 409);
    } finally {
      fs.writeFileSync(SMOKE_SPEC_ABS, originalContent);
    }
  })
);

test(
  'discard tears down the session without creating a diff record',
  withServer(async ({ baseUrl, testsStore, runsStore }) => {
    const { test, run } = seedFailedRun(testsStore, runsStore);
    const startRes = await fetch(`${baseUrl}/api/debug-sessions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ testId: test.id, runId: run.id }),
    });
    const { sessionId }: any = await startRes.json();
    const worktreePath = path.join(repoRoot, '.debug-worktrees', sessionId);
    assert.ok(fs.existsSync(worktreePath));

    const discardRes = await fetch(`${baseUrl}/api/debug-sessions/${sessionId}/discard`, {
      method: 'POST',
      headers: jsonHeaders,
    });
    assert.equal(discardRes.status, 204);
    assert.equal(fs.existsSync(worktreePath), false);

    // The per-test lock is freed too — starting again immediately should succeed.
    const restartRes = await fetch(`${baseUrl}/api/debug-sessions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ testId: test.id, runId: run.id }),
    });
    assert.equal(restartRes.status, 201);
    const { sessionId: secondId }: any = await restartRes.json();
    await fetch(`${baseUrl}/api/debug-sessions/${secondId}/discard`, { method: 'POST', headers: jsonHeaders });
  })
);
