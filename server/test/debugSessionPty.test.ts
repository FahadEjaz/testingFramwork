// Real end-to-end test of the Phase 12 container + PTY plumbing — spawns an actual Docker
// container via node-pty (same engine session.ts uses in production), using
// DEBUG_SESSION_COMMAND_OVERRIDE to run a plain shell instead of the real `claude` CLI so this
// doesn't need a real ANTHROPIC_API_KEY (consistent with this project's existing precedent: see
// PROGRESS.md's Phase 9 note that AI-healing itself was never exercised against the real API in
// this sandbox either — the difference tested for real here is the isolation/plumbing, not
// claude's own behavior). Skips itself if docker isn't available, same spirit as other tests that
// depend on optional host tooling.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DebugSession } = require('../src/debugSession/session.ts');
const worktree = require('../src/debugSession/worktree.ts');

const repoRoot = path.resolve(__dirname, '..', '..');

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function imageAvailable(): boolean {
  try {
    const out = execFileSync('docker', ['images', '-q', 'tfv2-debug-session:latest']).toString().trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

const skip = !dockerAvailable() || !imageAvailable();

// Polls instead of a fixed sleep — under full-suite contention (many real docker/browser tests
// competing for CPU) a fixed delay tuned for an isolated run can flake when the whole suite runs
// concurrently, where the same shell round-trip genuinely just takes longer.
async function waitFor(predicate: () => boolean, timeoutMs: number, pollMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

test(
  'a real container runs a shell over the pty, edits a bind-mounted file, and cleans up on stop',
  { skip: skip ? 'docker or tfv2-debug-session:latest image not available in this environment' : false },
  async () => {
    process.env.DEBUG_SESSION_COMMAND_OVERRIDE = 'sh';
    const sessionId = `pty-test-${Date.now()}`;
    const worktreePath = worktree.createWorktree(repoRoot, sessionId, 'tests/smoke.spec.ts', 'manifests/smoke.json');
    const auditLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'debug-audit-')), 'log.jsonl');

    const session = new DebugSession(sessionId, 'test-id', worktreePath, '', auditLogPath, Date.now());

    let output = '';
    const gotOutput = new Promise<void>((resolve) => {
      session.start(
        (chunk: string) => {
          output += chunk;
          if (output.includes('READY_MARKER')) resolve();
        },
        () => {}
      );
    });

    // Give the container a moment to actually be created before writing to it. Both this delay
    // and the race timeout below are generous on purpose — a real `docker run` competing with
    // this project's other real-browser/real-container tests for CPU (the full suite runs test
    // files concurrently) can legitimately take longer to become responsive than it does in
    // isolation.
    await new Promise((r) => setTimeout(r, 1500));
    session.write('echo READY_MARKER\n');
    await Promise.race([gotOutput, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for shell output')), 45000))]);

    assert.equal(session.status, 'live');

    // Simulate "claude" editing the failing spec from inside the container — this must land on
    // the real bind-mounted worktree file on the host, since that's what captureDiff() reads.
    session.write("printf '\\n// edited from inside the container\\n' >> tests/smoke.spec.ts\n");
    await waitFor(() => session.captureDiff().diff.includes('edited from inside the container'), 15000);

    const { diff, files } = session.captureDiff();
    assert.match(diff, /edited from inside the container/);
    assert.deepEqual(files, ['tests/smoke.spec.ts']);

    // An email typed into the pty must never reach the audit log unredacted.
    session.write('echo test-user@example.com\n');
    await waitFor(() => fs.existsSync(auditLogPath) && fs.readFileSync(auditLogPath, 'utf8').includes('[REDACTED-EMAIL]'), 15000);
    const auditRaw = fs.readFileSync(auditLogPath, 'utf8');
    assert.ok(!auditRaw.includes('test-user@example.com'), 'raw email must not appear in the audit log');
    assert.ok(auditRaw.includes('[REDACTED-EMAIL]'), 'redacted placeholder should appear instead');

    session.write('exit\n');
    session.stop();

    await waitFor(() => {
      const out = execFileSync('docker', [
        'ps',
        '-a',
        '--filter',
        `name=tfv2-debug-${sessionId}`,
        '--format',
        '{{.Names}}',
      ])
        .toString()
        .trim();
      return out === '';
    }, 15000);

    worktree.teardown(repoRoot, worktreePath);
    delete process.env.DEBUG_SESSION_COMMAND_OVERRIDE;
  }
);
