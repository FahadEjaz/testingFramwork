#!/usr/bin/env node
// Reads healing events recorded during the last test run (test-results/healing-events.jsonl,
// written by tests/support/resilient-locator.ts) and, for each healed element, patches its
// manifest + spec file and commits the fix to a dedicated local branch
// (auto/healed-<timestamp>) — never the branch you were on. Does NOT push or open a PR; that
// is a deliberate follow-up step for a human (or a later CI job) to run explicitly, per
// REQUIREMENTS.md's "no silent self-modification" rule.
//
// Usage: npm test ; node scripts/apply-healing-patches.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { manifestPathForSpec, saveManifest, codeForEntry } = require('./lib/manifest');
const { patchSpecLocator } = require('./lib/patch-spec-locator');

const repoRoot = path.resolve(__dirname, '..');
const logPath = process.env.HEALING_LOG_PATH ?? path.join(repoRoot, 'test-results', 'healing-events.jsonl');

function readEvents() {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function dedupeLatestPerElement(events) {
  const byKey = new Map();
  for (const event of events) byKey.set(`${event.spec}::${event.elementKey}`, event);
  return [...byKey.values()];
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// This script commits patched files onto a fresh branch cut from HEAD, then switches back —
// which only restores the original branch's files correctly if those files were already
// committed there. An untracked or already-dirty file would get "claimed" by the new branch
// and vanish from the current branch's working tree on checkout-back. So refuse up front.
function assertCleanAndTracked(relativePath) {
  const statusOutput = git(['status', '--porcelain', '--', relativePath]);
  if (statusOutput) {
    throw new Error(
      `${relativePath} is untracked or has uncommitted changes — commit it first. ` +
      'This script assumes the spec/manifest it patches already have a clean, committed ' +
      'baseline on the current branch (that\'s what lets it safely stash the fix on its own ' +
      'auto/healed-* branch and switch back without losing anything).'
    );
  }
}

function main() {
  const events = dedupeLatestPerElement(readEvents());
  if (events.length === 0) {
    console.log('No healing events recorded — nothing to patch.');
    return;
  }

  for (const event of events) {
    assertCleanAndTracked(path.relative(repoRoot, manifestPathForSpec(repoRoot, event.spec)));
    assertCleanAndTracked(event.spec);
  }

  const originalBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const patchedFiles = new Set();

  for (const event of events) {
    const manifestPath = manifestPathForSpec(repoRoot, event.spec);
    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entry = manifestData.elements[event.elementKey];
    if (!entry) {
      console.warn(`No manifest entry for ${event.spec}::${event.elementKey} — skipping.`);
      continue;
    }

    const remainingFallbacks = entry.fallbacks.filter((_, i) => i !== event.fallbackIndex);
    entry.fallbacks = [entry.primary, ...remainingFallbacks];
    entry.primary = event.newPrimary;
    saveManifest(manifestPath, manifestData);
    patchedFiles.add(path.relative(repoRoot, manifestPath));

    const specPath = path.join(repoRoot, event.spec);
    const specSource = fs.readFileSync(specPath, 'utf8');
    const newSource = patchSpecLocator(specSource, specPath, event.elementKey, codeForEntry(event.newPrimary));
    if (newSource) {
      fs.writeFileSync(specPath, newSource);
      patchedFiles.add(event.spec);
    } else {
      console.warn(
        `Could not find resilientLocator('${event.elementKey}') in ${event.spec} to patch — ` +
        'manifest updated, spec left as-is.'
      );
    }
  }

  if (patchedFiles.size === 0) {
    console.log('No files needed patching.');
    return;
  }

  const branchName = `auto/healed-${Date.now()}`;
  git(['checkout', '-b', branchName]);
  git(['add', ...patchedFiles]);
  git([
    'commit',
    '-m',
    `Self-heal ${events.length} locator(s) via deterministic fallback\n\nNo AI used — Phase 2 fallback chain only. Review before merging.`,
  ]);
  git(['checkout', originalBranch]);

  console.log(`Committed ${patchedFiles.size} patched file(s) to local branch ${branchName} (not pushed).`);
  console.log(`Review with: git diff ${originalBranch} ${branchName}`);
  console.log(
    `To open a PR once reviewed: git push -u origin ${branchName} && gh pr create ` +
    `--title "Self-heal: ${events.length} locator(s)" --body "..."`
  );
}

main();
