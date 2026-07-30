// Integration tests for the Phase 6 recording routes. Run with: node --test server/test/*.test.ts
// Drives the REST start/stop/save flow against a real headless-Chromium session (same engine
// as production) against a throwaway local fixture page. The click itself is sent through the
// session's own input API directly rather than over a websocket — the websocket/screencast
// layer is best-effort and repaint-timing-dependent by nature (see PROGRESS.md), so asserting
// on it here would make this suite flaky for reasons that have nothing to do with correctness.
// That layer was verified manually instead.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createApp } = require('../src/app.ts');

const repoRoot = path.resolve(__dirname, '..', '..');
const credentials = { username: 'tester', password: 'secret' };
const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
const jsonHeaders = { Authorization: authHeader, 'Content-Type': 'application/json' };

function withServer(fn: (ctx: { baseUrl: string; sessionManager: any }) => Promise<void>) {
  return async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-test-'));
    const { app, sessionManager } = createApp({ repoRoot, dataDir, credentials });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await fn({ baseUrl: `http://127.0.0.1:${port}`, sessionManager });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

async function withFixtureServer(fn: (fixtureUrl: string) => Promise<void>) {
  const html =
    '<!doctype html><html><body style="margin:0">' +
    '<button data-testid="go-btn" style="position:absolute;top:50px;left:50px;width:80px;height:30px;">Go</button>' +
    '</body></html>';
  const fixtureServer = http.createServer((_req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise((resolve) => fixtureServer.listen(0, resolve));
  const port = fixtureServer.address().port;
  try {
    await fn(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise((resolve) => fixtureServer.close(resolve));
  }
}

test(
  'POST /api/recordings requires auth',
  withServer(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/recordings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://example.com' }),
    });
    assert.equal(res.status, 401);
  })
);

test(
  'POST /api/recordings rejects missing/invalid url',
  withServer(async ({ baseUrl }) => {
    const missing = await fetch(`${baseUrl}/api/recordings`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);

    const badProtocol = await fetch(`${baseUrl}/api/recordings`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ url: 'ftp://example.com' }),
    });
    assert.equal(badProtocol.status, 400);
  })
);

test(
  'stop/save on an unknown session id return 404',
  withServer(async ({ baseUrl }) => {
    const stop = await fetch(`${baseUrl}/api/recordings/does-not-exist/stop`, {
      method: 'POST',
      headers: jsonHeaders,
    });
    assert.equal(stop.status, 404);

    const save = await fetch(`${baseUrl}/api/recordings/does-not-exist/save`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'x' }),
    });
    assert.equal(save.status, 404);
  })
);

test(
  'full record -> click -> stop -> save writes a working spec + manifest',
  withServer(async ({ baseUrl, sessionManager }) => {
    await withFixtureServer(async (fixtureUrl) => {
      const startRes = await fetch(`${baseUrl}/api/recordings`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ url: fixtureUrl }),
      });
      assert.equal(startRes.status, 201);
      const { sessionId }: any = await startRes.json();

      const session = sessionManager.get(sessionId);
      assert.ok(session, 'session should be registered in the manager');
      await session.dispatchMouseEvent({ type: 'mousePressed', x: 90, y: 65 });
      await session.dispatchMouseEvent({ type: 'mouseReleased', x: 90, y: 65 });
      await new Promise((r) => setTimeout(r, 200));

      const stopRes = await fetch(`${baseUrl}/api/recordings/${sessionId}/stop`, {
        method: 'POST',
        headers: jsonHeaders,
      });
      assert.equal(stopRes.status, 200);
      const stopBody: any = await stopRes.json();
      assert.equal(stopBody.actions.length, 1);
      assert.equal(stopBody.actions[0].type, 'click');
      assert.ok(
        stopBody.actions[0].candidates.some((c: any) => c.strategy === 'testId' && c.value === 'go-btn')
      );

      const saveRes = await fetch(`${baseUrl}/api/recordings/${sessionId}/save`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Recorded click test' }),
      });
      assert.equal(saveRes.status, 201);
      const testCase: any = await saveRes.json();
      assert.equal(testCase.name, 'Recorded click test');
      assert.equal(testCase.specPath, 'tests/recorded-click-test.spec.ts');

      const specAbs = path.join(repoRoot, testCase.specPath);
      const manifestAbs = path.join(repoRoot, 'manifests', 'recorded-click-test.json');
      try {
        assert.ok(fs.existsSync(specAbs), 'spec file should have been written');
        assert.ok(fs.existsSync(manifestAbs), 'manifest file should have been written');

        const manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'));
        assert.equal(manifest.elements.element1.primary.strategy, 'testId');
        assert.ok(manifest.elements.element1.fallbacks.length >= 2);

        const specSource = fs.readFileSync(specAbs, 'utf8');
        assert.match(specSource, /resilientLocator/);
        assert.match(specSource, /getByTestId\('go-btn'\)/);

        // A second recording saved under the same name should conflict on disk.
        const dupStart = await fetch(`${baseUrl}/api/recordings`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ url: fixtureUrl }),
        });
        const { sessionId: dupId }: any = await dupStart.json();
        await fetch(`${baseUrl}/api/recordings/${dupId}/stop`, { method: 'POST', headers: jsonHeaders });
        const dupSave = await fetch(`${baseUrl}/api/recordings/${dupId}/save`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ name: 'Recorded click test' }),
        });
        assert.equal(dupSave.status, 409);
      } finally {
        fs.rmSync(specAbs, { force: true });
        fs.rmSync(manifestAbs, { force: true });
      }
    });
  })
);
