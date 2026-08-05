// Express app factory (Phase 4) — wraps the existing engine (tests/, manifests/, the
// resilient-locator runner) behind an authenticated HTTP API. No direct file or git access is
// required by an API client; see REQUIREMENTS.md Section 3.4-3.5 / PLAN.md Phase 4.
import type { Application } from 'express';
import type { Credentials } from './auth';

const express = require('express');
const { basicAuth } = require('./auth.ts');
const { createTestsStore } = require('./storage/testsStore.ts');
const { createRunsStore } = require('./storage/runsStore.ts');
const { createPendingFixesStore } = require('./storage/pendingFixesStore.ts');
const { createTestsRouter } = require('./routes/tests.ts');
const { createPendingFixesRouter } = require('./routes/pendingFixes.ts');
const { createRecordingsRouter } = require('./routes/recordings.ts');
const { createRunReportRouter } = require('./routes/runReport.ts');
const { createDebugSessionsRouter } = require('./routes/debugSessions.ts');
const { SessionManager } = require('./recording/sessionManager.ts');
const { RunManager } = require('./execution/runManager.ts');
const { DebugSessionManager } = require('./debugSession/sessionManager.ts');
const { createDebugSessionDiffsStore } = require('./storage/debugSessionDiffsStore.ts');

export interface CreateAppOptions {
  repoRoot: string;
  dataDir: string;
  credentials: Credentials;
  sessionManager?: unknown;
  // Overridable so tests can exercise the healing -> Pending Fixes wiring (routes/tests.ts) with
  // a fake outcome instead of spawning a real Playwright process.
  runSpec?: unknown;
  debugSessionManager?: unknown;
  // Skips the boot-time orphan sweep (docker ps / git worktree list) — tests spin up many
  // throwaway apps in a row and don't want each one shelling out to docker.
  skipDebugSessionSweep?: boolean;
}

export interface CreatedApp {
  app: Application;
  sessionManager: unknown;
  debugSessionManager: unknown;
}

function createApp({
  repoRoot,
  dataDir,
  credentials,
  sessionManager,
  runSpec,
  debugSessionManager,
  skipDebugSessionSweep,
}: CreateAppOptions): CreatedApp {
  const app = express();
  app.use(express.json());

  const testsStore = createTestsStore(dataDir);
  const runsStore = createRunsStore(dataDir);
  const pendingFixesStore = createPendingFixesStore(dataDir);
  const debugSessionDiffsStore = createDebugSessionDiffsStore(dataDir);
  const recordingSessionManager = sessionManager ?? new SessionManager();
  const runManager = new RunManager();
  const debugSessMgr = debugSessionManager ?? new DebugSessionManager(repoRoot, dataDir);
  if (!skipDebugSessionSweep) {
    try {
      debugSessMgr.sweepOrphans(debugSessionDiffsStore);
    } catch (err) {
      console.warn(`Debug-session orphan sweep failed (non-fatal): ${(err as any)?.message ?? err}`);
    }
  }

  // Unauthenticated so an orchestrator/load balancer can probe it without credentials.
  app.get('/api/health', (_req: any, res: any) => res.json({ ok: true }));
  // Also unauthenticated — see runReport.ts's own comment for why (browser page loads can't
  // attach a Basic-auth header; the run id's unguessability is the capability instead).
  app.use('/api', createRunReportRouter({ dataDir, runsStore }));

  app.use('/api', basicAuth(credentials));

  app.use(
    '/api',
    createTestsRouter({ repoRoot, dataDir, testsStore, runsStore, pendingFixesStore, runManager, runSpec: runSpec as any })
  );
  app.use('/api', createPendingFixesRouter({ repoRoot, pendingFixesStore }));
  app.use('/api', createRecordingsRouter({ repoRoot, testsStore, sessionManager: recordingSessionManager }));
  app.use(
    '/api',
    createDebugSessionsRouter({
      repoRoot,
      testsStore,
      runsStore,
      debugSessionDiffsStore,
      debugSessionManager: debugSessMgr,
    })
  );

  return { app, sessionManager: recordingSessionManager, debugSessionManager: debugSessMgr };
}

module.exports = { createApp };
