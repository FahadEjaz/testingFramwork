// Integration tests for in-app script editing: GET/PATCH /api/tests/:id/source. A throwaway
// fixture spec is written under tests/ (same precedent as app.test.ts's __phase8-fixture) and
// removed afterward, since POST /tests requires specPath to already exist on disk.
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

const fixtureSpecRelative = 'tests/__edit-source-fixture.spec.ts';
const fixtureSpecAbsolute = path.join(repoRoot, fixtureSpecRelative);
const VALID_SOURCE = "import { test } from '@playwright/test';\ntest('x', async () => {});\n";

function withServer(fn: (ctx: { baseUrl: string }) => Promise<void>) {
  return async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-source-test-'));
    fs.writeFileSync(fixtureSpecAbsolute, VALID_SOURCE);
    const { app } = createApp({ repoRoot, dataDir, credentials });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await fn({ baseUrl: `http://127.0.0.1:${port}` });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.rmSync(fixtureSpecAbsolute, { force: true });
    }
  };
}

async function createFixtureTest(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/tests`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name: 'Edit source fixture', specPath: fixtureSpecRelative }),
  });
  return res.json();
}

test(
  'GET /tests/:id/source returns the real file contents',
  withServer(async ({ baseUrl }) => {
    const created: any = await createFixtureTest(baseUrl);
    const res = await fetch(`${baseUrl}/api/tests/${created.id}/source`, { headers: jsonHeaders });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.source, VALID_SOURCE);
  })
);

test(
  'GET /tests/:id/source requires auth',
  withServer(async ({ baseUrl }) => {
    const created: any = await createFixtureTest(baseUrl);
    const res = await fetch(`${baseUrl}/api/tests/${created.id}/source`);
    assert.equal(res.status, 401);
  })
);

test(
  'GET /tests/:id/source 404s for an unknown test',
  withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/tests/does-not-exist/source`, { headers: jsonHeaders });
    assert.equal(res.status, 404);
  })
);

test(
  'PATCH /tests/:id/source writes valid edited source to disk',
  withServer(async ({ baseUrl }) => {
    const created: any = await createFixtureTest(baseUrl);
    const newSource = "import { test } from '@playwright/test';\ntest('renamed', async () => { /* edited */ });\n";

    const res = await fetch(`${baseUrl}/api/tests/${created.id}/source`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ source: newSource }),
    });
    assert.equal(res.status, 200);
    assert.equal(fs.readFileSync(fixtureSpecAbsolute, 'utf8'), newSource);
  })
);

test(
  'PATCH /tests/:id/source rejects syntactically invalid source and leaves the file untouched',
  withServer(async ({ baseUrl }) => {
    const created: any = await createFixtureTest(baseUrl);
    const broken = "import { test } from '@playwright/test';\ntest('broken', async () => { const x = ; });\n";

    const res = await fetch(`${baseUrl}/api/tests/${created.id}/source`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ source: broken }),
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.details) && body.details.length > 0);
    assert.equal(fs.readFileSync(fixtureSpecAbsolute, 'utf8'), VALID_SOURCE);
  })
);

test(
  'PATCH /tests/:id/source rejects an empty body',
  withServer(async ({ baseUrl }) => {
    const created: any = await createFixtureTest(baseUrl);
    const res = await fetch(`${baseUrl}/api/tests/${created.id}/source`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ source: '   ' }),
    });
    assert.equal(res.status, 400);
  })
);
