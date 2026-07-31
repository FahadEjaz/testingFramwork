// File-backed store for the Pending Fixes queue (Phase 4 storage foundation; Phase 8 wires
// Phase 2's fallback-healing pipeline into it and adds the manifest/spec-patching side of
// Approve — see PLAN.md / REQUIREMENTS.md 3.3).
import type { HealingEvent, TokenUsage } from './runsStore';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export type PendingFixSource = 'fallback' | 'ai';
export type PendingFixStatus = 'pending' | 'approved' | 'rejected';

export interface PendingFix {
  id: string;
  testId: string;
  spec: string;
  elementKey: string;
  oldPrimary: unknown;
  newPrimary: unknown;
  // Index into the manifest entry's `fallbacks` array that `newPrimary` came from — needed to
  // remove it from `fallbacks` (rather than duplicate it there) when Approve promotes it to
  // `primary`. Mirrors scripts/apply-healing-patches.js's HealingEvent-driven patch logic.
  fallbackIndex: number;
  source: PendingFixSource;
  // Only present for source: 'ai' — REQUIREMENTS.md 3.4/Phase 9's "token cost visible" bar.
  tokensUsed?: TokenUsage;
  status: PendingFixStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PendingFixesStore {
  list(status?: PendingFixStatus): PendingFix[];
  get(id: string): PendingFix | undefined;
  add(fix: Omit<PendingFix, 'id' | 'status' | 'createdAt' | 'updatedAt'>): PendingFix;
  update(id: string, status: PendingFixStatus): PendingFix | undefined;
  // Queues one pending fix per healing event from a run, skipping any element that already has
  // an undecided pending fix queued (so a test that keeps healing the same element run after run
  // before anyone reviews it doesn't spam duplicates). Returns only the newly-created fixes.
  recordHealing(testId: string, events: HealingEvent[], source: PendingFixSource): PendingFix[];
}

function createPendingFixesStore(dataDir: string): PendingFixesStore {
  const filePath = path.join(dataDir, 'pending-fixes.json');

  function readAll(): PendingFix[] {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeAll(fixes: PendingFix[]) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(fixes, null, 2)}\n`);
  }

  function list(status?: PendingFixStatus): PendingFix[] {
    const fixes = readAll();
    return status ? fixes.filter((f) => f.status === status) : fixes;
  }

  function get(id: string): PendingFix | undefined {
    return readAll().find((f) => f.id === id);
  }

  function add(fix: Omit<PendingFix, 'id' | 'status' | 'createdAt' | 'updatedAt'>): PendingFix {
    const fixes = readAll();
    const now = new Date().toISOString();
    const full: PendingFix = { id: crypto.randomUUID(), status: 'pending', createdAt: now, updatedAt: now, ...fix };
    fixes.push(full);
    writeAll(fixes);
    return full;
  }

  function update(id: string, status: PendingFixStatus): PendingFix | undefined {
    const fixes = readAll();
    const fix = fixes.find((f) => f.id === id);
    if (!fix) return undefined;
    fix.status = status;
    fix.updatedAt = new Date().toISOString();
    writeAll(fixes);
    return fix;
  }

  function recordHealing(testId: string, events: HealingEvent[], source: PendingFixSource): PendingFix[] {
    const fixes = readAll();
    const now = new Date().toISOString();
    const created: PendingFix[] = [];

    for (const event of events) {
      const alreadyQueued = fixes.some(
        (f) => f.status === 'pending' && f.testId === testId && f.spec === event.spec && f.elementKey === event.elementKey
      );
      if (alreadyQueued) continue;

      const fix: PendingFix = {
        id: crypto.randomUUID(),
        testId,
        spec: event.spec,
        elementKey: event.elementKey,
        oldPrimary: event.oldPrimary,
        newPrimary: event.newPrimary,
        fallbackIndex: event.fallbackIndex,
        source,
        tokensUsed: event.tokensUsed,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      fixes.push(fix);
      created.push(fix);
    }

    if (created.length > 0) writeAll(fixes);
    return created;
  }

  return { list, get, add, update, recordHealing };
}

module.exports = { createPendingFixesStore };
