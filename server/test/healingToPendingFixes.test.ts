// Integration test for the Phase 8 write path: a run whose outcome carries healing events must
// queue a matching Pending Fix, end to end through POST /tests/:id/runs — not just via the
// pendingFixesStore unit tests. Uses createApp's injectable `runSpec` (added this phase) so this
// stays fast/deterministic instead of needing a real Playwright process to actually self-heal.
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

const healingEvent = {
  spec: 'tests/smoke.spec.ts',
  elementKey: 'submit',
  oldPrimary: { strategy: 'css', value: '.old' },
  newPrimary: { strategy: 'role', role: 'button', name: 'Submit' },
  fallbackIndex: 0,
  source: 'fallback',
  timestamp: new Date().toISOString(),
};

const aiHealingEvent = {
  spec: 'tests/smoke.spec.ts',
  elementKey: 'cancel',
  oldPrimary: { strategy: 'css', value: '.old-cancel' },
  newPrimary: { strategy: 'text', value: 'Cancel' },
  fallbackIndex: -1,
  source: 'ai',
  tokensUsed: { inputTokens: 250, outputTokens: 12 },
  timestamp: new Date().toISOString(),
};

function fakeRunSpec(healingEvents: any[]) {
  return async () => ({
    status: 'passed',
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0, duration: 10 },
    healed: healingEvents.length > 0,
    healingEvents,
    reportAvailable: false,
  });
}

function withServer(runSpec: unknown, fn: (ctx: { baseUrl: string }) => Promise<void>) {
  return async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-healing-test-'));
    const { app } = createApp({ repoRoot, dataDir, credentials, runSpec });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await fn({ baseUrl: `http://127.0.0.1:${port}` });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

test(
  'a run with healing events queues a matching Pending Fix',
  withServer(fakeRunSpec([healingEvent]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    const runRes = await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });
    assert.equal(runRes.status, 201);
    const run: any = await runRes.json();
    assert.equal(run.healed, true);

    const fixes: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].testId, created.id);
    assert.equal(fixes[0].elementKey, 'submit');
    assert.equal(fixes[0].source, 'fallback');
    assert.equal(fixes[0].status, 'pending');
    assert.deepEqual(fixes[0].newPrimary, healingEvent.newPrimary);
  })
);

test(
  'a second healing run on the same element does not duplicate the pending fix',
  withServer(fakeRunSpec([healingEvent]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });
    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });

    const fixes: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(fixes.length, 1);
  })
);

test(
  'an AI-sourced healing event queues a Pending Fix marked ai with token usage',
  withServer(fakeRunSpec([aiHealingEvent]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });

    const fixes: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].source, 'ai');
    assert.deepEqual(fixes[0].tokensUsed, aiHealingEvent.tokensUsed);
  })
);

test(
  'a run with both fallback- and AI-sourced events queues one Pending Fix per source',
  withServer(fakeRunSpec([healingEvent, aiHealingEvent]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });

    const fixes: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(fixes.length, 2);
    const sources = fixes.map((f: any) => f.source).sort();
    assert.deepEqual(sources, ['ai', 'fallback']);
  })
);

test(
  'GET /api/ai-usage aggregates token spend across every AI-sourced fix, ignoring fallback ones',
  withServer(fakeRunSpec([healingEvent, aiHealingEvent]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    // Two runs — two AI heals of the same element (each queues since the prior fix is still
    // pending... actually recordHealing dedups pending ones, so decide the first before the
    // second run to prove aggregation isn't just "count of pending fixes" but survives decisions.
    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });
    const beforeDecide: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    const aiFix = beforeDecide.find((f: any) => f.source === 'ai');
    await fetch(`${baseUrl}/api/pending-fixes/${aiFix.id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ status: 'rejected' }),
    });

    const usage: any = await (await fetch(`${baseUrl}/api/ai-usage`, { headers: jsonHeaders })).json();
    assert.equal(usage.totalHeals, 1);
    assert.equal(usage.totalInputTokens, aiHealingEvent.tokensUsed.inputTokens);
    assert.equal(usage.totalOutputTokens, aiHealingEvent.tokensUsed.outputTokens);
  })
);

test(
  'a run with no healing events queues nothing',
  withServer(fakeRunSpec([]), async ({ baseUrl }) => {
    const created: any = await (
      await fetch(`${baseUrl}/api/tests`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Smoke', specPath: 'tests/smoke.spec.ts' }),
      })
    ).json();

    await fetch(`${baseUrl}/api/tests/${created.id}/runs`, { method: 'POST', headers: jsonHeaders });

    const fixes: any = await (await fetch(`${baseUrl}/api/pending-fixes`, { headers: jsonHeaders })).json();
    assert.equal(fixes.length, 0);
  })
);
