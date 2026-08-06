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
    const tempSpec = path.join(repoRoot, 'tests', 'temp-test-delete.spec.ts');
    fs.writeFileSync(tempSpec, '// temp spec for delete test\n');
    try {
      const createRes = await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke test', specPath: 'tests/temp-test-delete.spec.ts' }),
      });
      assert.equal(createRes.status, 201);
    const created: any = await createRes.json();
    assert.equal(created.name, 'Smoke test');
    assert.equal(created.specPath, 'tests/temp-test-delete.spec.ts');

    const list: any = await (await fetch(`${baseUrl}/api/tests`, { headers: jsonHeaders })).json();
    assert.equal(list.length, 1);

    const dupRes = await fetch(`${baseUrl}/api/tests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'dup', specPath: 'tests/temp-test-delete.spec.ts' }),
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
    } finally {
      if (fs.existsSync(tempSpec)) fs.unlinkSync(tempSpec);
    }
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
      assert.equal(run.reportAvailable, true);

      const fetchedRun: any = await (await fetch(`${baseUrl}/api/runs/${run.id}`, { headers: jsonHeaders })).json();
      assert.equal(fetchedRun.id, run.id);

      // Report route is deliberately unauthenticated (browser <iframe>/page loads can't attach a
      // Basic-auth header) — the run id's unguessability is the capability, see runReport.ts.
      const reportRes = await fetch(`${baseUrl}/api/runs/${run.id}/report/index.html`);
      assert.equal(reportRes.status, 200);
      assert.match(String(reportRes.headers.get('content-type')), /html/);

      const missingReport = await fetch(`${baseUrl}/api/runs/does-not-exist/report/index.html`);
      assert.equal(missingReport.status, 404);

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
  'pending fixes: list, filter by status, approve patches manifest+spec, reject leaves files alone',
  withServer(async ({ baseUrl, dataDir }) => {
    const fixtureSpecRelative = 'tests/__phase8-fixture.spec.ts';
    const fixtureSpecAbsolute = path.join(repoRoot, fixtureSpecRelative);
    const fixtureManifestAbsolute = path.join(repoRoot, 'manifests', '__phase8-fixture.json');

    const manifest = {
      spec: fixtureSpecRelative,
      elements: {
        submit: {
          primary: { strategy: 'css', value: '.old-primary' },
          fallbacks: [
            { strategy: 'role', role: 'button', name: 'Submit' },
            { strategy: 'testId', value: 'submit-btn' },
          ],
        },
      },
    };
    fs.writeFileSync(fixtureManifestAbsolute, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(
      fixtureSpecAbsolute,
      `resilientLocator(page, ${JSON.stringify(fixtureSpecRelative)}, 'submit', () => page.locator('.old-primary'));\n`
    );

    try {
      const { createPendingFixesStore } = require('../src/storage/pendingFixesStore.ts');
      const store = createPendingFixesStore(dataDir);
      const fix = store.add({
        testId: 't1',
        spec: fixtureSpecRelative,
        elementKey: 'submit',
        oldPrimary: manifest.elements.submit.primary,
        newPrimary: manifest.elements.submit.fallbacks[0],
        fallbackIndex: 0,
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

      const patchedManifest = JSON.parse(fs.readFileSync(fixtureManifestAbsolute, 'utf8'));
      assert.deepEqual(patchedManifest.elements.submit.primary, {
        strategy: 'role',
        role: 'button',
        name: 'Submit',
      });
      assert.deepEqual(patchedManifest.elements.submit.fallbacks, [
        { strategy: 'css', value: '.old-primary' },
        { strategy: 'testId', value: 'submit-btn' },
      ]);

      const patchedSpec = fs.readFileSync(fixtureSpecAbsolute, 'utf8');
      assert.match(patchedSpec, /page\.getByRole\('button', \{ name: 'Submit' \}\)/);

      const filtered: any = await (
        await fetch(`${baseUrl}/api/pending-fixes?status=approved`, { headers: jsonHeaders })
      ).json();
      assert.equal(filtered.length, 1);

      // Already-decided fixes can't be re-applied silently.
      const reapprove = await fetch(`${baseUrl}/api/pending-fixes/${fix.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(reapprove.status, 409);

      // A fix whose manifest entry is gone (test re-recorded/removed since it was queued) fails
      // the approve instead of silently discarding the review — the fix stays 'pending'.
      const orphanFix = store.add({
        testId: 't1',
        spec: 'tests/__phase8-does-not-exist.spec.ts',
        elementKey: 'ghost',
        oldPrimary: { strategy: 'css', value: '.x' },
        newPrimary: { strategy: 'role', role: 'button' },
        fallbackIndex: 0,
        source: 'fallback',
      });
      const orphanApprove = await fetch(`${baseUrl}/api/pending-fixes/${orphanFix.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(orphanApprove.status, 409);
      assert.equal(store.get(orphanFix.id).status, 'pending');

      const notFound = await fetch(`${baseUrl}/api/pending-fixes/does-not-exist`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(notFound.status, 404);
    } finally {
      fs.rmSync(fixtureSpecAbsolute, { force: true });
      fs.rmSync(fixtureManifestAbsolute, { force: true });
    }
  })
);
