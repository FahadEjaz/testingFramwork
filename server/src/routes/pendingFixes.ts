// fetch/update Pending Fixes (Phase 4 storage foundation; Phase 8 builds the review UI and
// wires Phase 2's healing pipeline to actually populate this — see PLAN.md).
import type { Request, Response, Router as RouterType } from 'express';
import type { PendingFixesStore, PendingFixStatus } from '../storage/pendingFixesStore';

const express = require('express');

const VALID_STATUSES: PendingFixStatus[] = ['pending', 'approved', 'rejected'];

export interface PendingFixesRouterDeps {
  pendingFixesStore: PendingFixesStore;
}

function createPendingFixesRouter({ pendingFixesStore }: PendingFixesRouterDeps): RouterType {
  const router = express.Router();

  router.get('/pending-fixes', (req: Request, res: Response) => {
    const status = req.query.status;
    if (status !== undefined && !VALID_STATUSES.includes(status as PendingFixStatus)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    res.json(pendingFixesStore.list(status as PendingFixStatus | undefined));
  });

  router.patch('/pending-fixes/:id', (req: Request<{ id: string }>, res: Response) => {
    const { status } = req.body ?? {};
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
    const updated = pendingFixesStore.update(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'pending fix not found' });
    res.json(updated);
  });

  return router;
}

module.exports = { createPendingFixesRouter };
