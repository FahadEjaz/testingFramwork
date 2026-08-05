// PTY-over-websocket for Phase 12 debug sessions, at /ws/debug-sessions/:id (see PLAN.md's gated
// "In-app AI debug terminal"). Unlike Phase 6's recording websocket (session-id-as-capability),
// this validates and *consumes* a single-use, short-lived token before `handleUpgrade` even
// proceeds — this channel grants shell execution inside the session's container, not just
// screencast viewing, so it gets the stricter check.
const { WebSocketServer } = require('ws');
const { URL } = require('url');

function attachDebugSessionWebsocket(httpServer: any, sessionManager: any): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: any, socket: any, head: any) => {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    const match = pathname.match(/^\/ws\/debug-sessions\/([^/]+)$/);
    if (!match) return; // not ours — let another handler (Phase 6's recording ws) claim it

    const requestedId = match[1];
    const token = searchParams.get('token');
    const sessionId = token ? sessionManager.consumeToken(token) : undefined;
    if (!sessionId || sessionId !== requestedId) {
      socket.destroy();
      return;
    }

    const session = sessionManager.get(sessionId);
    // 'starting' is the expected status here on a session's first-ever connection: session.start()
    // (which flips it to 'live') is only called from the 'connection' handler below, which only
    // fires *after* this upgrade succeeds — refusing anything but 'live' at this point meant the
    // very first connection could never succeed at all (caught live in this session's own browser
    // verification: every session hung with "socket hang up" on its first connection attempt).
    // Only an already-'stopped' session should be refused.
    if (!session || session.status === 'stopped') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: any) => {
      wss.emit('connection', ws, req, session);
    });
  });

  wss.on('connection', (ws: any, _req: any, session: any) => {
    // Buffer nothing before this listener attaches — start() is only ever called once the
    // websocket handler is wiring up the very session it validated a token for, so there's no
    // Phase 6-style "connect after the first frame" gap here (a PTY has no equivalent of a
    // single repaint being missed; every byte is buffered by the OS pty itself until read).
    session.start(
      (chunk: string) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: chunk }));
      },
      () => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'exit' }));
      }
    );

    ws.on('message', (raw: Buffer) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.kind === 'input') session.write(message.data ?? '');
      else if (message.kind === 'resize') session.resize(message.cols, message.rows);
    });

    ws.on('close', () => {
      // A disconnect mid-session doesn't tear the container down — the human may just have
      // refreshed the tab. The idle sweep (sessionManager.ts) reclaims it if no one reconnects.
    });
  });
}

module.exports = { attachDebugSessionWebsocket };
