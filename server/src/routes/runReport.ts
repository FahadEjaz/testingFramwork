// Serves each run's self-contained Playwright HTML report (Phase 7). Mounted before basicAuth
// in app.ts and deliberately unauthenticated — a browser page load/<iframe> can't attach a
// custom Authorization header, the same browser limitation server/src/recording/
// websocketHandler.ts already documents (and accepts) for the recording websocket. The run's id
// (an unguessable UUID, mintable only via an authenticated POST /tests/:id/runs) is the
// capability token instead.
import type { Request, Response, NextFunction, Router as RouterType } from 'express';
import type { RunsStore } from '../storage/runsStore';

const express = require('express');
const path = require('path');

export interface RunReportRouterDeps {
  dataDir: string;
  runsStore: RunsStore;
}

function createRunReportRouter({ dataDir, runsStore }: RunReportRouterDeps): RouterType {
  const router = express.Router();

  router.use('/runs/:runId/report', (req: Request<{ runId: string }>, res: Response, next: NextFunction) => {
    const run = runsStore.get(req.params.runId);
    if (!run || !run.reportAvailable) {
      return res.status(404).json({ error: 'report not found' });
    }
    express.static(path.join(dataDir, 'runs', req.params.runId, 'report'))(req, res, next);
  });

  return router;
}

module.exports = { createRunReportRouter };
