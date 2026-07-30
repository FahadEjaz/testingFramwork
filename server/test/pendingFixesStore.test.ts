// Unit tests for pendingFixesStore's Phase 8 addition, recordHealing() — the write path that
// turns a run's healing events into queued Pending Fixes (no HTTP, no Playwright).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPendingFixesStore } = require('../src/storage/pendingFixesStore.ts');

function withDataDir(fn: (dataDir: string) => void) {
  return () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-store-test-'));
    try {
      fn(dataDir);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

const event = (overrides: Partial<any> = {}) => ({
  spec: 'tests/x.spec.ts',
  elementKey: 'submit',
  oldPrimary: { strategy: 'css', value: '.old' },
  newPrimary: { strategy: 'role', role: 'button' },
  fallbackIndex: 0,
  timestamp: new Date().toISOString(),
  ...overrides,
});

test(
  'recordHealing queues one pending fix per event',
  withDataDir((dataDir) => {
    const store = createPendingFixesStore(dataDir);
    const created = store.recordHealing('test-1', [event(), event({ elementKey: 'cancel' })], 'fallback');
    assert.equal(created.length, 2);
    assert.equal(store.list('pending').length, 2);
    assert.ok(created.every((f: any) => f.source === 'fallback' && f.status === 'pending'));
  })
);

test(
  'recordHealing skips an element that already has an undecided pending fix',
  withDataDir((dataDir) => {
    const store = createPendingFixesStore(dataDir);
    const first = store.recordHealing('test-1', [event()], 'fallback');
    assert.equal(first.length, 1);

    // Same test heals the same element again on a later run before anyone reviewed the first —
    // should not spam a second entry.
    const second = store.recordHealing('test-1', [event()], 'fallback');
    assert.equal(second.length, 0);
    assert.equal(store.list('pending').length, 1);
  })
);

test(
  'recordHealing queues a new fix once the prior one for that element was decided',
  withDataDir((dataDir) => {
    const store = createPendingFixesStore(dataDir);
    const [first] = store.recordHealing('test-1', [event()], 'fallback');
    store.update(first.id, 'rejected');

    const second = store.recordHealing('test-1', [event()], 'fallback');
    assert.equal(second.length, 1);
    assert.equal(store.list('pending').length, 1);
  })
);

test(
  'recordHealing treats different tests/specs/elements as independent',
  withDataDir((dataDir) => {
    const store = createPendingFixesStore(dataDir);
    store.recordHealing('test-1', [event()], 'fallback');
    const forOtherTest = store.recordHealing('test-2', [event()], 'fallback');
    const forOtherElement = store.recordHealing('test-1', [event({ elementKey: 'other' })], 'fallback');
    assert.equal(forOtherTest.length, 1);
    assert.equal(forOtherElement.length, 1);
    assert.equal(store.list('pending').length, 3);
  })
);
