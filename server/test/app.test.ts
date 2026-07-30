// Integration tests for the Phase 4 backend API. Run with: node --test server/test/app.test.ts
// Each test gets its own throwaway data dir (never touches the real server/data), and the run-
// triggering test spawns a real `npx playwright test` against a throwaway no-browser spec so it
// stays fast and network-free while still exercising the actual child-process/JSON-reporter
// pipeline end to end.
// Plain require()s throughout (not `import`) so this file parses as CommonJS under Node's
// native TS type-stripping — see server/README notes on why there's no ts-node/tsx dependency.
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

function withServer(fn: (ctx: { baseUrl: string; dataDir: string }) => Promise<void>) {
  return async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-test-'));
    const { app } = createApp({ repoRoot, dataDir, credentials });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await fn({ baseUrl: `http://127.0.0.1:${port}`, dataDir });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

test(
  'health check requires no auth',
  withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  })
);

test(
  '/api/tests requires auth',
  withServer(async ({ baseUrl }) => {
    const anon = await fetch(`${baseUrl}/api/tests`);
    assert.equal(anon.status, 401);

    const badHeader = `Basic ${Buffer.from('nope:nope').toString('base64')}`;
    const wrong = await fetch(`${baseUrl}/api/tests`, { headers: { Authorization: badHeader } });
    assert.equal(wrong.status, 401);
  })
);

test(
  'create/list/rename/delete a test case',
  withServer(async ({ baseUrl }) => {
    const createRes = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'Smoke test', specPath: 'tests/smoke.spec.ts' }),
    });
    assert.equal(createRes.status, 201);
    const created: any = await createRes.json();
    assert.equal(created.name, 'Smoke test');
    assert.equal(created.specPath, 'tests/smoke.spec.ts');

    const list: any = await (await fetch(`${baseUrl}/api/tests`, { headers: jsonHeaders })).json();
    assert.equal(list.length, 1);

    const dupRes = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'dup', specPath: 'tests/smoke.spec.ts' }),
    });
    assert.equal(dupRes.status, 409);

    const renameRes = await fetch(`${baseUrl}/api/tests/${created.id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'Renamed' }),
    });
    assert.equal(renameRes.status, 200);
    assert.equal(((await renameRes.json()) as any).name, 'Renamed');

    const deleteRes = await fetch(`${baseUrl}/api/tests/${created.id}`, { method: 'DELETE', headers: jsonHeaders });
    assert.equal(deleteRes.status, 204);

    const afterDelete: any = await (await fetch(`${baseUrl}/api/tests`, { headers: jsonHeaders })).json();
    assert.equal(afterDelete.length, 0);
  })
);

test(
  'rejects specPath outside the repo or not a .spec.ts file',
  withServer(async ({ baseUrl }) => {
    const traversal = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'x', specPath: '../../etc/passwd.spec.ts' }),
    });
    assert.equal(traversal.status, 400);

    const notSpec = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'x', specPath: 'package.json' }),
    });
    assert.equal(notSpec.status, 400);

    const missing = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'x', specPath: 'tests/does-not-exist.spec.ts' }),
    });
    assert.equal(missing.status, 400);
  })
);

test(
  'trigger a run and read back structured results',
  withServer(async ({ baseUrl }) => {
    const noopSpecRelative = 'tests/__phase4-noop.spec.ts';
    const noopSpecAbsolute = path.join(repoRoot, noopSpecRelative);
    fs.writeFileSync(
      noopSpecAbsolute,
      "import { test, expect } from '@playwright/test';\ntest('noop', () => { expect(1 + 1).toBe(2); });\n"
    );

    try {
      const created: any = await (
        await fetch(`${baseUrl}/api/tests`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ name: 'Noop', specPath: noopSpecRelative }),
        })
      ).json();

      const runRes = await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });
      assert.equal(runRes.status, 201);
      const run: any = await runRes.json();
      assert.equal(run.status, 'passed');
      assert.equal(run.healed, false);
      assert.equal(run.stats.expected, 1);
      assert.equal(run.stats.unexpected, 0);

      const fetchedRun: any = await (await fetch(`${baseUrl}/api/runs/${run.id}`, { headers: jsonHeaders })).json();
      assert.equal(fetchedRun.id, run.id);

      const runsForTest: any = await (
        await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { headers: jsonHeaders })
      ).json();
      assert.equal(runsForTest.length, 1);

      const missingRun = await fetch(`${baseUrl}/api/runs/does-not-exist`, { headers: jsonHeaders });
      assert.equal(missingRun.status, 404);

      const missingTestRuns = await fetch(`${baseUrl}/api/tests/does-not-exist/runs`, { headers: jsonHeaders });
      assert.equal(missingTestRuns.status, 404);
    } finally {
      fs.rmSync(noopSpecAbsolute, { force: true });
    }
  })
);

test(
  'pending fixes: list, filter by status, approve/reject',
  withServer(async ({ baseUrl, dataDir }) => {
    const { createPendingFixesStore } = require('../src/storage/pendingFixesStore.ts');
    const store = createPendingFixesStore(dataDir);
    const fix = store.add({
      testId: 't1',
      spec: 'tests/x.spec.ts',
      elementKey: 'submit',
      oldPrimary: { strategy: 'css', value: '.old' },
      newPrimary: { strategy: 'role', role: 'button' },
      source: 'fallback',
    });

    const list: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'pending');

    const badStatus = await fetch(`${baseUrl}/api/pending-fixes?status=bogus`, { headers: jsonHeaders });
    assert.equal(badStatus.status, 400);

    const approveRes = await fetch(`${baseUrl}/api/pending-fixes/${fix.id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(approveRes.status, 200);
    assert.equal(((await approveRes.json()) as any).status, 'approved');

    const filtered: any = await (
      await fetch(`${baseUrl}/api/pending-fixes?status=approved`, { headers: jsonHeaders })
    ).json();
    assert.equal(filtered.length, 1);

    const notFound = await fetch(`${baseUrl}/api/pending-fixes/does-not-exist`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(notFound.status, 404);
  })
);
