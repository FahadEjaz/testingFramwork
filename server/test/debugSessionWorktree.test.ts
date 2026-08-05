// Unit tests for the Phase 12 spike's worktree isolation. Runs real `git worktree`/
// `sparse-checkout` commands against this actual repo (readonly except inside the throwaway
// worktree itself, which is always torn down in `finally`) — no mocking git, since the entire
// point of this module is getting real git sparse-checkout behavior right (see worktree.ts's own
// comment about the leading-slash bug this caught during development).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const wt = require('../src/debugSession/worktree.ts');

const repoRoot = path.resolve(__dirname, '..', '..');

function withWorktree(fn: (worktreePath: string) => void) {
  return () => {
    const sessionId = `test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const worktreePath = wt.createWorktree(repoRoot, sessionId, 'tests/smoke.spec.ts', 'manifests/smoke.json');
    try {
      fn(worktreePath);
    } finally {
      wt.teardown(repoRoot, worktreePath);
    }
  };
}

// `git ls-files` lists every tracked path regardless of sparse-checkout's skip-worktree bit —
// what matters here is what actually landed on disk, so walk the real directory tree instead.
function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs, base));
    else out.push(path.relative(base, abs));
  }
  return out;
}

test(
  'createWorktree includes the spec/manifest + shared support files, nothing else',
  withWorktree((worktreePath: string) => {
    const files = walkFiles(worktreePath).sort();
    assert.deepEqual(files, [
      'manifests/smoke.json',
      'package.json',
      'playwright.config.ts',
      'tests/smoke.spec.ts',
      'tests/support/dismiss-popups.ts',
      'tests/support/fixtures.ts',
      'tests/support/resilient-locator.ts',
      'tsconfig.json',
    ]);
  })
);

test(
  'createWorktree does not leak files from unrelated top-level directories',
  withWorktree((worktreePath: string) => {
    assert.equal(fs.existsSync(path.join(worktreePath, 'web')), false);
    assert.equal(fs.existsSync(path.join(worktreePath, 'server')), false);
    assert.equal(fs.existsSync(path.join(worktreePath, 'tests', 'theme-toggle.spec.ts')), false);
    assert.equal(fs.existsSync(path.join(worktreePath, 'manifests', 'theme-toggle.json')), false);
  })
);

test(
  'getDiff/getTouchedFiles reflect an edit made inside the worktree',
  withWorktree((worktreePath: string) => {
    assert.equal(wt.getDiff(worktreePath), '');
    assert.deepEqual(wt.getTouchedFiles(worktreePath), []);

    const specAbs = path.join(worktreePath, 'tests', 'smoke.spec.ts');
    fs.writeFileSync(specAbs, `${fs.readFileSync(specAbs, 'utf8')}\n// debug-session edit\n`);

    assert.match(wt.getDiff(worktreePath), /debug-session edit/);
    assert.deepEqual(wt.getTouchedFiles(worktreePath), ['tests/smoke.spec.ts']);
  })
);

test('teardown removes the worktree directory and deregisters it from git', () => {
  const sessionId = `test-${process.pid}-${Date.now()}-teardown`;
  const worktreePath = wt.createWorktree(repoRoot, sessionId, 'tests/smoke.spec.ts', 'manifests/smoke.json');
  assert.ok(fs.existsSync(worktreePath));

  wt.teardown(repoRoot, worktreePath);

  assert.equal(fs.existsSync(worktreePath), false);
  const registered = wt.listOrphanedWorktrees(repoRoot);
  assert.ok(!registered.includes(worktreePath));
});

test('the live checkout itself is never mutated by a worktree edit', () => {
  const beforeStatus = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });

  const sessionId = `test-${process.pid}-${Date.now()}-isolation`;
  const worktreePath = wt.createWorktree(repoRoot, sessionId, 'tests/smoke.spec.ts', 'manifests/smoke.json');
  try {
    const specAbs = path.join(worktreePath, 'tests', 'smoke.spec.ts');
    fs.writeFileSync(specAbs, `${fs.readFileSync(specAbs, 'utf8')}\n// should never touch the real file\n`);

    const liveSpec = fs.readFileSync(path.join(repoRoot, 'tests', 'smoke.spec.ts'), 'utf8');
    assert.ok(!liveSpec.includes('should never touch the real file'));

    const afterStatus = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(afterStatus, beforeStatus);
  } finally {
    wt.teardown(repoRoot, worktreePath);
  }
});
