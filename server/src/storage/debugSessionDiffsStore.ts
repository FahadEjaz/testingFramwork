// File-backed review queue for Phase 12's debug-session diffs (see PLAN.md's gated "In-app AI
// debug terminal"). Deliberately its own store, not pendingFixesStore — that one's shape
// (oldPrimary/newPrimary/fallbackIndex) is locator-swap-specific, safe because
// patchSpecLocator's AST surgery targets exactly one known expression; a live-coding session's
// diff is unstructured and can touch multiple files, so there's no equivalent narrow patch
// operation to apply — just `git apply` against a captured unified diff.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export type DebugSessionDiffStatus = 'pending' | 'approved' | 'rejected';

export interface DebugSessionDiff {
  id: string;
  testId: string;
  sessionId: string;
  worktreePath: string;
  diff: string;
  files: string[];
  // sha256 of each touched file's content in the *live* checkout at the moment the diff was
  // captured — approve() re-hashes the live files and refuses (409, mirroring pendingFixes.ts's
  // own stale-manifest check) if any no longer match, since the diff was generated against a
  // worktree snapshot that may since have drifted from the real checkout.
  baseHashes: Record<string, string>;
  status: DebugSessionDiffStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DebugSessionDiffsStore {
  list(status?: DebugSessionDiffStatus): DebugSessionDiff[];
  get(id: string): DebugSessionDiff | undefined;
  add(input: {
    testId: string;
    sessionId: string;
    worktreePath: string;
    diff: string;
    files: string[];
    baseHashes: Record<string, string>;
  }): DebugSessionDiff;
  update(id: string, status: DebugSessionDiffStatus): DebugSessionDiff | undefined;
}

function createDebugSessionDiffsStore(dataDir: string): DebugSessionDiffsStore {
  const filePath = path.join(dataDir, 'debug-session-diffs.json');

  function readAll(): DebugSessionDiff[] {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeAll(diffs: DebugSessionDiff[]) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(diffs, null, 2)}\n`);
  }

  function list(status?: DebugSessionDiffStatus): DebugSessionDiff[] {
    const diffs = readAll();
    return status ? diffs.filter((d) => d.status === status) : diffs;
  }

  function get(id: string): DebugSessionDiff | undefined {
    return readAll().find((d) => d.id === id);
  }

  function add(input: {
    testId: string;
    sessionId: string;
    worktreePath: string;
    diff: string;
    files: string[];
    baseHashes: Record<string, string>;
  }): DebugSessionDiff {
    const diffs = readAll();
    const now = new Date().toISOString();
    const full: DebugSessionDiff = { id: crypto.randomUUID(), status: 'pending', createdAt: now, updatedAt: now, ...input };
    diffs.push(full);
    writeAll(diffs);
    return full;
  }

  function update(id: string, status: DebugSessionDiffStatus): DebugSessionDiff | undefined {
    const diffs = readAll();
    const record = diffs.find((d) => d.id === id);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    writeAll(diffs);
    return record;
  }

  return { list, get, add, update };
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = { createDebugSessionDiffsStore, sha256 };
