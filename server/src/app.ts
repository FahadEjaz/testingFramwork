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

export interface CreateAppOptions {
  repoRoot: string;
  dataDir: string;
  credentials: Credentials;
}

function createApp({ repoRoot, dataDir, credentials }: CreateAppOptions): Application {
  const app = express();
  app.use(express.json());

  // Unauthenticated so an orchestrator/load balancer can probe it without credentials.
  app.get('/api/health', (_req: any, res: any) => res.json({ ok: true }));

  app.use('/api', basicAuth(credentials));

  const testsStore = createTestsStore(dataDir);
  const runsStore = createRunsStore(dataDir);
  const pendingFixesStore = createPendingFixesStore(dataDir);

  app.use('/api', createTestsRouter({ repoRoot, testsStore, runsStore }));
  app.use('/api', createPendingFixesRouter({ pendingFixesStore }));

  return app;
}

module.exports = { createApp };
