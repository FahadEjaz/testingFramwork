// One `claude` CLI session per debug session, running inside a locked-down Docker container
// bind-mounted to a sparse-checked-out git worktree (worktree.ts) — Phase 12 spike, see PLAN.md's
// gated "In-app AI debug terminal". PTY-over-websocket is wired up by websocketHandler.ts; this
// class just owns the container + pty process + audit log.
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const worktree = require('./worktree.ts');
const { redactSecrets } = require('../../../scripts/lib/redact.js');

const IMAGE_NAME = process.env.DEBUG_SESSION_IMAGE || 'tfv2-debug-session:latest';
const NETWORK_NAME = 'tfv2-debug-net';
const PROXY_HOST = 'tfv2-debug-proxy';
const CONTAINER_MEMORY = process.env.DEBUG_SESSION_MEMORY || '512m';
const CONTAINER_CPUS = process.env.DEBUG_SESSION_CPUS || '1';
// Heuristic delay before writing the seed prompt into the pty — long enough for the CLI's own
// startup banner/prompt to render first. The prompt is written but never auto-submitted (no
// trailing Enter) — REQUIREMENTS.md 4's "no silent self-modification" plus a direct mitigation
// against adversarial content in the error string itself: a human must read it and press Enter.
const SEED_DELAY_MS = 1500;

function networkExists(name: string): boolean {
  try {
    execFileSync('docker', ['network', 'inspect', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export type DebugSessionStatus = 'starting' | 'live' | 'stopped';

class DebugSession {
  readonly id: string;
  readonly testId: string;
  readonly worktreePath: string;
  status: DebugSessionStatus = 'starting';
  lastActivityAt: number;

  private containerName: string;
  private ptyProcess: any;
  private auditLogPath: string;
  private seedPrompt: string;
  private seeded = false;
  private onData?: (chunk: string) => void;
  private onExitCb?: () => void;

  constructor(id: string, testId: string, worktreePath: string, seedPrompt: string, auditLogPath: string, now: number) {
    this.id = id;
    this.testId = testId;
    this.worktreePath = worktreePath;
    this.seedPrompt = seedPrompt;
    this.auditLogPath = auditLogPath;
    this.containerName = `tfv2-debug-${id}`;
    this.lastActivityAt = now;
  }

  private appendAudit(direction: 'in' | 'out', data: string): void {
    try {
      fs.mkdirSync(path.dirname(this.auditLogPath), { recursive: true });
      fs.appendFileSync(
        this.auditLogPath,
        `${JSON.stringify({ t: new Date().toISOString(), direction, data: redactSecrets(data) })}\n`
      );
    } catch {
      // A logging failure must never take down the session itself — same precedent as Phase 2's
      // resilientLocator, which learned this the hard way (see PROGRESS.md).
    }
  }

  // Idempotent by design: a *reconnect* (fresh token minted for an already-`live` session — see
  // sessionManager.ts's idempotent start()) must rebind the callbacks to the existing
  // container/pty, not spawn a second one. Only ever spawns once per session; every call after
  // the first just re-points where output/exit get delivered (matters for xterm.js's terminal
  // page remounting on a page refresh, whether via a real reconnect or React StrictMode's
  // dev-mode double-invoke — both hit this same path).
  start(onData: (chunk: string) => void, onExit: () => void): void {
    this.onData = onData;
    this.onExitCb = onExit;
    if (this.ptyProcess) return;

    const args = [
      'run',
      '--rm',
      // Both flags matter: `-i` alone gives the container a plain pipe for stdin, which `claude`
      // (correctly) treats as non-interactive/piped input rather than its normal interactive
      // REPL — caught live via a real container showing claude's own "Input must be provided
      // either through stdin or as a prompt argument when using --print" error. `-t` allocates
      // the actual pseudo-TTY the CLI checks for. node-pty already gives the `docker` client
      // process itself a pty; this is what makes *the container's inner process* see one too.
      '-i',
      '-t',
      '--name',
      this.containerName,
      '--label',
      `com.testingframework.debug-session=${this.id}`,
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--tmpfs',
      '/home/node/.claude:size=50m',
      '--cap-drop=ALL',
      '--security-opt',
      'no-new-privileges',
      '--memory',
      CONTAINER_MEMORY,
      '--cpus',
      CONTAINER_CPUS,
      '-v',
      `${this.worktreePath}:/workspace:rw`,
    ];

    // Fail closed: no dedicated network + proxy set up (scripts/setup-debug-session-network.sh)
    // means no network at all, rather than an unrestricted one. A session started this way can
    // still edit files with `claude`, just can't reach the real Anthropic API until the human
    // finishes that one-time host setup (documented separately — it needs sudo for the
    // accompanying iptables rule, which this process can't run non-interactively anyway).
    if (networkExists(NETWORK_NAME)) {
      args.push('--network', NETWORK_NAME);
      args.push('-e', `HTTPS_PROXY=http://${PROXY_HOST}:8888`, '-e', `HTTP_PROXY=http://${PROXY_HOST}:8888`);
    } else {
      args.push('--network', 'none');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      args.push('-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
    }

    // Test-only escape hatch: exercise the pty/container/audit-log plumbing with a harmless
    // command that needs no API key, instead of a real interactive `claude` session. Never set
    // in production — see server/test/debugSession*.test.ts.
    const override = process.env.DEBUG_SESSION_COMMAND_OVERRIDE;
    if (override) args.push('--entrypoint', override);
    args.push(IMAGE_NAME);

    this.ptyProcess = pty.spawn('docker', args, {
      name: 'xterm-color',
      cols: 100,
      rows: 30,
    });
    this.status = 'live';

    this.ptyProcess.onData((chunk: string) => {
      this.lastActivityAt = Date.now();
      this.appendAudit('out', chunk);
      this.onData?.(chunk);
      if (!this.seeded && this.seedPrompt) {
        this.seeded = true;
        setTimeout(() => {
          if (this.status === 'live') this.write(this.seedPrompt);
        }, SEED_DELAY_MS);
      }
    });

    this.ptyProcess.onExit(() => {
      this.status = 'stopped';
      this.onExitCb?.();
    });
  }

  write(input: string): void {
    this.lastActivityAt = Date.now();
    this.appendAudit('in', input);
    this.ptyProcess?.write(input);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows);
  }

  captureDiff(): { diff: string; files: string[] } {
    return { diff: worktree.getDiff(this.worktreePath), files: worktree.getTouchedFiles(this.worktreePath) };
  }

  // Served only over the normal authenticated REST API (see routes/debugSessions.ts) — never an
  // unauthenticated route the way Phase 7's run-report iframe is, per PLAN.md's explicit call-out
  // that a keystroke transcript needs the stricter treatment.
  readAuditLog(): Array<{ t: string; direction: 'in' | 'out'; data: string }> {
    if (!fs.existsSync(this.auditLogPath)) return [];
    return fs
      .readFileSync(this.auditLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line: string) => JSON.parse(line));
  }

  stop(): void {
    if (this.status === 'stopped') return;
    this.status = 'stopped';
    try {
      this.ptyProcess?.kill();
    } catch {
      // already gone
    }
    // `--rm` normally cleans the container up on its own exit, but an abnormal kill (idle sweep,
    // server restart) can leave it behind — belt and suspenders, matching session.ts's Phase 6
    // counterpart tolerating an already-gone browser.
    try {
      execSync(`docker rm -f ${this.containerName}`, { stdio: 'ignore' });
    } catch {
      // already gone
    }
  }
}

module.exports = { DebugSession, networkExists, NETWORK_NAME };
