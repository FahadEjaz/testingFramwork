// Git worktree + sparse-checkout isolation for the Phase 12 debug-session spike (see PLAN.md's
// gated "In-app AI debug terminal"). A live `claude` CLI session gets shell access inside this
// worktree, never the real checkout — REQUIREMENTS.md's "no silent self-modification" still
// holds because nothing here writes back to the live repo directly; only an explicit
// Approve (see storage/debugSessionDiffsStore.ts) applies the captured diff via `git apply`.
//
// Sparse-checkout is non-cone (`--no-cone`), scoped to exact file paths rather than whole
// directories, since the whole point is limiting exposure to the failing test's own files plus
// the minimum shared support code needed to actually run/edit it — not "the directory it lives
// in" (tests/ holds every other test too).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKTREES_DIR_NAME = '.debug-worktrees';

// Always included alongside the failing spec/manifest — the minimum a `claude` session needs to
// actually run the test and understand how resilientLocator/fixtures work, without exposing
// server/, web/, other tests, or any dotfile (.env, credentials, etc).
const SHARED_SUPPORT_PATHS = [
  '/package.json',
  '/tsconfig.json',
  '/playwright.config.ts',
  '/tests/support',
];

function worktreesRoot(repoRoot: string): string {
  return path.join(repoRoot, WORKTREES_DIR_NAME);
}

function worktreePathFor(repoRoot: string, sessionId: string): string {
  return path.join(worktreesRoot(repoRoot), sessionId);
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

// `git worktree add`/`remove` mutate shared metadata under the main repo's `.git/worktrees/` —
// two concurrent invocations against the same repo (confirmed the hard way: running this
// project's own test files in parallel, each creating/tearing down worktrees against this same
// repo, intermittently corrupted each other's git state) aren't safe without external
// serialization. A real deployment only ever runs one server process against one checkout, so
// production risk is low, but nothing prevents two `git worktree` calls from this process
// overlapping either (e.g. one session's teardown racing another's create) — cheap enough to just
// always serialize via a simple exclusive-create lock file.
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_MS = 25;

function withWorktreeLock<T>(repoRoot: string, fn: () => T): T {
  const lockPath = path.join(repoRoot, '.git', 'debug-worktree.lock');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline) throw new Error('Timed out waiting for the debug-session worktree lock');
      // Synchronous sleep — every other call in this module is already blocking (execFileSync),
      // so a real async wait here would buy nothing but complexity.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lockPath);
  }
}

// `git worktree add` refuses if the target directory already exists with unrelated content, and
// sparse-checkout only trims what's present in the working copy — both fail loudly rather than
// silently exposing more than intended if something is already wrong.
function createWorktree(repoRoot: string, sessionId: string, specPath: string, manifestPath: string): string {
  return withWorktreeLock(repoRoot, () => {
    const worktreePath = worktreePathFor(repoRoot, sessionId);
    fs.mkdirSync(worktreesRoot(repoRoot), { recursive: true });

    git(repoRoot, ['worktree', 'add', '--detach', worktreePath, 'HEAD']);
    git(repoRoot, ['-C', worktreePath, 'sparse-checkout', 'init', '--no-cone']);

    // `.git` inside a linked worktree is a file pointing at the real git-dir elsewhere, not a
    // directory — `sparse-checkout set` (rather than hand-writing the info/sparse-checkout file
    // directly) resolves that correctly regardless of the worktree's on-disk layout.
    // Leading slash anchors each pattern to the repo root — without it, non-cone sparse-checkout
    // treats a bare filename (no embedded slash) as a gitignore-style pattern matching at *any*
    // depth (confirmed the hard way: `package.json` with no leading slash pulled in
    // `web/package.json` too).
    const paths = [specPath, manifestPath, ...SHARED_SUPPORT_PATHS]
      .map((p) => (p.startsWith('/') ? p : `/${p}`))
      .filter((p) => fs.existsSync(path.join(repoRoot, p.slice(1))));
    git(repoRoot, ['-C', worktreePath, 'sparse-checkout', 'set', '--no-cone', ...paths]);

    return worktreePath;
  });
}

// Unified diff of every change made inside the worktree, relative to the commit it was created
// from — this, not the worktree's live files, is what an Approve (debugSessionDiffsStore.ts)
// applies back onto the real checkout via `git apply`.
function getDiff(worktreePath: string): string {
  try {
    return execFileSync('git', ['-C', worktreePath, 'diff', 'HEAD'], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function getTouchedFiles(worktreePath: string): string[] {
  try {
    const out = execFileSync('git', ['-C', worktreePath, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// `git worktree add ... HEAD` checks out committed history, not the live working directory — an
// uncommitted/untracked spec file is silently absent from the resulting worktree with no error at
// all (caught live: a debug session for an uncommitted test started "successfully" with an empty
// worktree, no spec/manifest, and no indication anything was wrong). Same underlying constraint
// `apply-healing-patches.js`'s `assertCleanAndTracked()` guard already enforces for a different
// reason — here it's exposed as an explicit, checkable precondition instead of a silent gap.
function isCommittedAtHead(repoRoot: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${relativePath}`], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function teardown(repoRoot: string, worktreePath: string): void {
  withWorktreeLock(repoRoot, () => {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoRoot });
    } catch {
      // Worktree dir may already be gone (manual cleanup, prior teardown) — `--force` already
      // covers "has uncommitted changes"; anything else here just means there's nothing left to
      // remove, which is the end state we wanted anyway.
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
    try {
      execFileSync('git', ['worktree', 'prune'], { cwd: repoRoot });
    } catch {
      // best-effort
    }
  });
}

// Boot-time sweep for worktrees left behind by a server crash mid-session — lists every worktree
// under .debug-worktrees/ that git itself still knows about, so a fresh server start can decide
// whether to salvage (capture diff) or discard each one.
function listOrphanedWorktrees(repoRoot: string): string[] {
  let out: string;
  try {
    out = git(repoRoot, ['worktree', 'list', '--porcelain']);
  } catch {
    return [];
  }
  const prefix = worktreesRoot(repoRoot);
  return out
    .split('\n\n')
    .map((block) => block.match(/^worktree (.+)$/m)?.[1])
    .filter((p): p is string => Boolean(p) && p!.startsWith(prefix));
}

module.exports = {
  worktreePathFor,
  createWorktree,
  getDiff,
  getTouchedFiles,
  teardown,
  listOrphanedWorktrees,
  isCommittedAtHead,
  SHARED_SUPPORT_PATHS,
};
