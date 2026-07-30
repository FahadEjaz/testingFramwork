// Unit tests for the Phase 7 run-concurrency cap. Plain require()s — see app.test.ts's header
// comment on why (CommonJS under Node's native TS type-stripping, no ts-node/tsx dependency).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RunManager, MAX_CONCURRENT_RUNS } = require('../src/execution/runManager.ts');

test('allows up to the concurrency cap, then throws CONCURRENCY_LIMIT', () => {
  const manager = new RunManager();
  for (let i = 0; i < MAX_CONCURRENT_RUNS; i += 1) {
    manager.start();
  }
  assert.equal(manager.activeCount(), MAX_CONCURRENT_RUNS);
  assert.throws(() => manager.start(), /CONCURRENCY_LIMIT/);
});

test('finish() frees a slot for a subsequent start()', () => {
  const manager = new RunManager();
  for (let i = 0; i < MAX_CONCURRENT_RUNS; i += 1) {
    manager.start();
  }
  manager.finish();
  assert.equal(manager.activeCount(), MAX_CONCURRENT_RUNS - 1);
  manager.start();
  assert.equal(manager.activeCount(), MAX_CONCURRENT_RUNS);
});

test('finish() never goes negative', () => {
  const manager = new RunManager();
  manager.finish();
  assert.equal(manager.activeCount(), 0);
});
