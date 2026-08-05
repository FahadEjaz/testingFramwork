// Real end-to-end test of the Phase 12 websocket upgrade handshake — added after this session's
// own live browser verification caught two real bugs this suite's other tests didn't:
// 1. The upgrade handler refused anything but `status === 'live'`, but a session only ever
//    becomes 'live' as a side effect of the 'connection' handler that runs *after* the upgrade
//    succeeds — so the very first connection to any session always failed ("socket hang up").
//    debugSessionPty.test.ts exercises DebugSession directly and never went through this
//    handler, which is exactly why it didn't catch this.
// 2. Phase 6's *pre-existing* recording/websocketHandler.ts unconditionally `socket.destroy()`s
//    any upgrade path it doesn't recognize — harmless when it was the only websocket handler on
//    the server, but production (index.ts) attaches it to the same httpServer as this one, and
//    it runs first (registered first), destroying every debug-session upgrade before this
//    handler's own listener ever ran. No existing test attached both handlers to one server the
//    way index.ts actually does, so nothing caught this either. Both handlers are attached here
//    together for exactly that reason.
// Uses a real HTTP server + real websocket client + a real Docker container
// (DEBUG_SESSION_COMMAND_OVERRIDE=sh, same reasoning as debugSessionPty.test.ts) so the actual
// upgrade path is what's under test, not a stand-in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const { DebugSessionManager } = require('../src/debugSession/sessionManager.ts');
const { attachDebugSessionWebsocket } = require('../src/debugSession/websocketHandler.ts');
const { attachRecordingWebsocket } = require('../src/recording/websocketHandler.ts');

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
    return execFileSync('docker', ['images', '-q', 'tfv2-debug-session:latest']).toString().trim().length > 0;
  } catch {
    return false;
  }
}

const skip = !dockerAvailable() || !imageAvailable();

test(
  'a fresh (starting) session connects successfully on its first attempt, and a reconnect reuses the same container',
  { skip: skip ? 'docker or tfv2-debug-session:latest image not available in this environment' : false },
  async () => {
    process.env.DEBUG_SESSION_COMMAND_OVERRIDE = 'sh';
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-ws-test-'));
    const manager = new DebugSessionManager(repoRoot, dataDir);
    const server = http.createServer((_req: any, res: any) => res.end());
    // Same order as index.ts: recording's handler attached first, debug-session's second — the
    // exact composition that exposed bug #2 above.
    attachRecordingWebsocket(server, {});
    attachDebugSessionWebsocket(server, manager);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const session = manager.start({
      testId: 'ws-test',
      specPath: 'tests/smoke.spec.ts',
      manifestPath: 'manifests/smoke.json',
      seedPrompt: '',
    });
    assert.equal(session.status, 'starting', 'sanity check: this is the exact status the bug tripped on');

    try {
      const token1 = manager.mintToken(session.id);
      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/debug-sessions/${session.id}?token=${token1}`);
      await new Promise<void>((resolve, reject) => {
        ws1.on('open', resolve);
        ws1.on('error', reject);
        ws1.on('unexpected-response', (_req: any, res: any) => reject(new Error(`HTTP ${res.statusCode}`)));
        setTimeout(() => reject(new Error('timed out waiting for first connection to open')), 10000);
      });
      assert.equal(session.status, 'live', 'connecting should have flipped status to live');

      await new Promise((r) => setTimeout(r, 1500)); // let the container actually finish starting
      const containersAfterFirst = execFileSync('docker', [
        'ps',
        '-a',
        '--filter',
        `label=com.testingframework.debug-session=${session.id}`,
        '--format',
        '{{.Names}}',
      ])
        .toString()
        .trim();
      assert.equal(containersAfterFirst.split('\n').filter(Boolean).length, 1);

      ws1.close();
      await new Promise((r) => setTimeout(r, 300));

      // A reconnect (fresh token, same still-live session) must succeed too, and must not spawn a
      // second container.
      const token2 = manager.mintToken(session.id);
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/debug-sessions/${session.id}?token=${token2}`);
      await new Promise<void>((resolve, reject) => {
        ws2.on('open', resolve);
        ws2.on('error', reject);
        ws2.on('unexpected-response', (_req: any, res: any) => reject(new Error(`HTTP ${res.statusCode}`)));
        setTimeout(() => reject(new Error('timed out waiting for reconnect to open')), 10000);
      });

      const containersAfterReconnect = execFileSync('docker', [
        'ps',
        '-a',
        '--filter',
        `label=com.testingframework.debug-session=${session.id}`,
        '--format',
        '{{.Names}}',
      ])
        .toString()
        .trim();
      assert.equal(
        containersAfterReconnect.split('\n').filter(Boolean).length,
        1,
        'a reconnect must reuse the existing container, not spawn a second one'
      );

      ws2.close();
    } finally {
      manager.dispose(session.id);
      fs.rmSync(dataDir, { recursive: true, force: true });
      delete process.env.DEBUG_SESSION_COMMAND_OVERRIDE;
      await new Promise((r) => server.close(r));
    }
  }
);

test(
  'an unknown/invalid token is refused at the upgrade, before any container is spawned',
  async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-ws-test-'));
    const manager = new DebugSessionManager(repoRoot, dataDir);
    const server = http.createServer((_req: any, res: any) => res.end());
    // Same order as index.ts: recording's handler attached first, debug-session's second — the
    // exact composition that exposed bug #2 above.
    attachRecordingWebsocket(server, {});
    attachDebugSessionWebsocket(server, manager);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/debug-sessions/does-not-exist?token=not-a-real-token`);
      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          throw new Error('should not have connected');
        });
        ws.on('close', () => resolve());
        ws.on('error', () => resolve());
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
      await new Promise((r) => server.close(r));
    }
  }
);
