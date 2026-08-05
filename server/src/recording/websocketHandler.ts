// The live screencast-out / input-in channel for a recording session (Phase 6). Deliberately
// separate from the REST control points in routes/recordings.ts — starting/stopping a session
// is a normal authenticated request/response; streaming frames and forwarding every mouse move
// needs a persistent connection.
//
// Auth note: browsers' native WebSocket API can't set an Authorization header, so this doesn't
// do a Basic-auth handshake on the upgrade. Instead it trusts possession of the session id
// itself as the capability — that id is a UUID returned only from the already-authenticated
// `POST /api/recordings` call, never guessable or listed anywhere. Acceptable for a single-
// shared-login internal tool; would need revisiting for anything more adversarial.
const { WebSocketServer } = require('ws');
const { URL } = require('url');

function attachRecordingWebsocket(httpServer: any, sessionManager: any): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: any, socket: any, head: any) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const match = pathname.match(/^\/ws\/recordings\/([^/]+)$/);
    // Not ours — let another handler (Phase 12's debug-session ws) claim it. Destroying here used
    // to be harmless when this was the only websocket handler on the server; now that a second
    // one shares the same httpServer 'upgrade' event, destroying unconditionally killed every
    // debug-session connection before its own handler (registered second, so it runs after this
    // one) ever got a chance to look at it — caught live via a real websocket client that saw
    // "socket hang up" on every single connection attempt, no matter what this handler's own logic
    // did.
    if (!match) return;

    const sessionId = match[1];
    const session = sessionManager.get(sessionId);
    if (!session || session.status !== 'live') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: any) => {
      wss.emit('connection', ws, req, session, sessionId);
    });
  });

  wss.on('connection', (ws: any, _req: any, session: any, sessionId: string) => {
    session.onFrameReceived((frame: { data: string; width: number; height: number }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'frame', ...frame }));
      }
    });

    ws.on('message', (raw: Buffer) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // `kind` is the envelope discriminator; `type` (where present) is passed straight through
      // as the CDP event type ('mousePressed'/'keyDown'/etc) — kept as separate fields so they
      // don't collide when both exist on the same message.
      switch (message.kind) {
        case 'mouse':
          session.dispatchMouseEvent(message).catch(() => {});
          break;
        case 'key':
          session.dispatchKeyEvent(message).catch(() => {});
          break;
        case 'text':
          session.insertText(message.text ?? '').catch(() => {});
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      // A disconnect while still recording (tab closed, network drop) means no one will ever
      // click Stop — treat it as abandoned and free the browser. A disconnect *after* Stop was
      // already called leaves the session in 'stopped' state, which sessionManager.dispose only
      // reaches via its own grace-period sweep, so a late reconnect-and-save isn't possible over
      // this same socket but the REST /save call still works independently.
      if (session.status === 'live') {
        sessionManager.dispose(sessionId).catch(() => {});
      }
    });
  });
}

module.exports = { attachRecordingWebsocket };
