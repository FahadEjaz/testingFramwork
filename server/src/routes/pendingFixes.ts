// fetch/update Pending Fixes, including Approve's file-patching side (Phase 8 — see PLAN.md
// "In-app healing review queue"). Reuses scripts/lib/manifest.js's manifest read/write helpers
// and scripts/lib/patch-spec-locator.js's .spec.ts rewrite (the same logic
// scripts/apply-healing-patches.js uses for its git-branch flow) — only where the result lands
// changes: a direct file write here, no branch/commit, since the end user has no git access at
// all. Rejecting stays a pure status flip; nothing on disk changes.
import type { Request, Response, Router as RouterType } from 'express';
import type { PendingFix, PendingFixesStore, PendingFixStatus } from '../storage/pendingFixesStore';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { manifestPathForSpec, saveManifest, codeForEntry } = require('../../../scripts/lib/manifest');
const { patchSpecLocator } = require('../../../scripts/lib/patch-spec-locator');

const VALID_STATUSES: PendingFixStatus[] = ['pending', 'approved', 'rejected'];

export interface PendingFixesRouterDeps {
  repoRoot: string;
  pendingFixesStore: PendingFixesStore;
}

// Promotes fix.newPrimary to the manifest's primary locator (old primary rejoins the fallback
// pool) and rewrites the spec's resilientLocator(...) call site to match, so the *next* run uses
// the healed locator as primary instead of relying on the fallback chain again — see PLAN.md
// Phase 8 "done when". Throws if the manifest entry is gone (e.g. the test was re-recorded since
// this fix was queued); leaves the manifest patched but warns if only the spec call site is
// missing, matching apply-healing-patches.js's own best-effort behavior.
function applyFixToFiles(repoRoot: string, fix: PendingFix): void {
  const manifestPath = manifestPathForSpec(repoRoot, fix.spec);
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifestData.elements[fix.elementKey];
  if (!entry) {
    throw new Error(`no manifest entry for ${fix.spec}::${fix.elementKey} — has the test been re-recorded since?`);
  }

  const remainingFallbacks = entry.fallbacks.filter((_: unknown, i: number) => i !== fix.fallbackIndex);
  entry.fallbacks = [entry.primary, ...remainingFallbacks];
  entry.primary = fix.newPrimary;
  saveManifest(manifestPath, manifestData);

  const specPath = path.join(repoRoot, fix.spec);
  const specSource = fs.readFileSync(specPath, 'utf8');
  const newSource = patchSpecLocator(specSource, specPath, fix.elementKey, codeForEntry(fix.newPrimary));
  if (newSource) {
    fs.writeFileSync(specPath, newSource);
  } else {
    console.warn(
      `Approved fix for ${fix.spec}::${fix.elementKey}: manifest updated, but no resilientLocator('${fix.elementKey}') ` +
      'call was found in the spec to patch.'
    );
  }
}

function createPendingFixesRouter({ repoRoot, pendingFixesStore }: PendingFixesRouterDeps): RouterType {
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

    const fix = pendingFixesStore.get(req.params.id);
    if (!fix) return res.status(404).json({ error: 'pending fix not found' });
    if (fix.status !== 'pending') {
      return res.status(409).json({ error: `pending fix was already ${fix.status}` });
    }

    if (status === 'approved') {
      try {
        applyFixToFiles(repoRoot, fix);
      } catch (err: any) {
        return res.status(409).json({ error: `could not apply fix: ${err?.message ?? err}` });
      }
    }

    const updated = pendingFixesStore.update(req.params.id, status);
    res.json(updated);
  });

  return router;
}

module.exports = { createPendingFixesRouter };
