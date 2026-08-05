// Unit tests for Phase 12's DebugSessionManager — concurrency cap, per-test exclusivity, and
// capability-token mint/consume/expiry. `start()` only creates the worktree (a real git
// operation, deliberately not mocked — see debugSessionWorktree.test.ts's own reasoning); it does
// NOT spawn Docker (that's session.start(), called separately by the websocket handler), so none
// of this needs a real container.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DebugSessionManager } = require('../src/debugSession/sessionManager.ts');

const repoRoot = path.resolve(__dirname, '..', '..');

function withManager(fn: (manager: any) => void) {
  return () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-session-mgr-'));
    const manager = new DebugSessionManager(repoRoot, dataDir);
    const created: string[] = [];
    const originalStart = manager.start.bind(manager);
    manager.start = (params: any) => {
      const session = originalStart(params);
      created.push(session.id);
      return session;
    };
    try {
      fn(manager);
    } finally {
      for (const id of created) manager.dispose(id);
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

const startParams = (testId: string) => ({
  testId,
  specPath: 'tests/smoke.spec.ts',
  manifestPath: 'manifests/smoke.json',
  seedPrompt: 'fix it',
});

test(
  'a second start() for the same test is idempotent — returns the existing session, not a new one',
  withManager((manager) => {
    const first = manager.start(startParams('test-a'));
    const second = manager.start(startParams('test-a'));
    assert.equal(second.id, first.id);
  })
);

test(
  'enforces the concurrency cap across different tests',
  withManager((manager) => {
    manager.start(startParams('test-a'));
    manager.start(startParams('test-b'));
    assert.throws(() => manager.start(startParams('test-c')), /CONCURRENCY_LIMIT/);
  })
);

test(
  'disposing a session frees both its concurrency slot and its per-test lock',
  withManager((manager) => {
    const a = manager.start(startParams('test-a'));
    manager.start(startParams('test-b'));
    manager.dispose(a.id);

    // Same test id can start a fresh session now that the per-test lock is free...
    const a2 = manager.start(startParams('test-a'));
    assert.ok(a2);
    // ...and with test-a's slot freed, a distinct third test fits under the concurrency cap too.
    manager.dispose(a2.id);
    const c = manager.start(startParams('test-c'));
    assert.ok(c);
  })
);

test(
  'mintToken/consumeToken: single-use, correct session id, and cannot be replayed',
  withManager((manager) => {
    const session = manager.start(startParams('test-a'));
    const token = manager.mintToken(session.id);

    assert.equal(manager.consumeToken(token), session.id);
    assert.equal(manager.consumeToken(token), undefined, 'a token must not be usable twice');
  })
);

test(
  'consumeToken rejects an unknown token',
  withManager((manager) => {
    assert.equal(manager.consumeToken('not-a-real-token'), undefined);
  })
);

test(
  'consumeToken rejects an expired token',
  withManager((manager) => {
    const session = manager.start(startParams('test-a'));
    const token = manager.mintToken(session.id);
    // Reach into the private map is the simplest way to simulate real TTL expiry without
    // sleeping 15 real minutes in a test.
    const entry = (manager as any).tokens.get(token);
    entry.expiresAt = Date.now() - 1;
    assert.equal(manager.consumeToken(token), undefined);
  })
);

test(
  'dispose() tears down the worktree on disk',
  withManager((manager) => {
    const session = manager.start(startParams('test-a'));
    const worktreePath = session.worktreePath;
    assert.ok(fs.existsSync(worktreePath));
    manager.dispose(session.id);
    assert.equal(fs.existsSync(worktreePath), false);
  })
);
