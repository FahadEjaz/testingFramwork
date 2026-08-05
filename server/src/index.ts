// Entrypoint: node server/src/index.ts (Node 24+ runs .ts directly, no build step needed —
// see PROGRESS.md decisions for why no ts-node/tsx dependency was added).
const path = require('path');
const http = require('http');
const { createApp } = require('./app.ts');
const { attachRecordingWebsocket } = require('./recording/websocketHandler.ts');
const { attachDebugSessionWebsocket } = require('./debugSession/websocketHandler.ts');

const repoRoot = path.resolve(__dirname, '..', '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(repoRoot, 'server', 'data');

const username = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
if (!username || !password) {
  console.error('APP_USERNAME and APP_PASSWORD env vars are required to start the server.');
  process.exit(1);
}

const { app, sessionManager, debugSessionManager } = createApp({
  repoRoot,
  dataDir,
  credentials: { username, password },
});
const server = http.createServer(app);
attachRecordingWebsocket(server, sessionManager);
attachDebugSessionWebsocket(server, debugSessionManager);

const port = Number(process.env.PORT) || 4000;

server.listen(port, () => {
  console.log(`Backend API listening on :${port} (data dir: ${dataDir})`);
});
