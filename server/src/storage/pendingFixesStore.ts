// File-backed store for the Pending Fixes queue (Phase 4 foundation for Phase 8's review UI —
// see PLAN.md / REQUIREMENTS.md 3.3). Nothing writes to this yet: Phase 2's healing pipeline
// still logs to healing-events.jsonl, and wiring that into this store instead is Phase 8's job.
// `add` exists so Phase 8 (and this store's own tests) has something to call.
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
  source: PendingFixSource;
  status: PendingFixStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PendingFixesStore {
  list(status?: PendingFixStatus): PendingFix[];
  get(id: string): PendingFix | undefined;
  add(fix: Omit<PendingFix, 'id' | 'status' | 'createdAt' | 'updatedAt'>): PendingFix;
  update(id: string, status: PendingFixStatus): PendingFix | undefined;
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

  return { list, get, add, update };
}

module.exports = { createPendingFixesStore };
