import type { Page, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadManifestForSpec, buildLocatorFromEntry } = require('../../scripts/lib/manifest');

const repoRoot = path.resolve(__dirname, '..', '..');
const healingLogPath = process.env.HEALING_LOG_PATH ?? path.join(repoRoot, 'test-results', 'healing-events.jsonl');

export interface ResilientLocatorOptions {
  timeoutMs?: number;
}

/**
 * Resolves a locator that self-heals via the manifest's fallback chain on failure — see
 * REQUIREMENTS.md 3.3 / PLAN.md Phase 2. The manifest is never read on the normal (primary
 * succeeds) path; it's consulted only once the primary locator fails to appear.
 */
export async function resilientLocator(
  page: Page,
  specRelativePath: string,
  elementKey: string,
  primaryFactory: () => Locator,
  opts: ResilientLocatorOptions = {}
): Promise<Locator> {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const primary = primaryFactory();

  try {
    await primary.waitFor({ state: 'visible', timeout: timeoutMs });
    return primary;
  } catch (primaryError) {
    const { data } = loadManifestForSpec(repoRoot, specRelativePath);
    const entry = data.elements[elementKey];
    if (!entry) throw primaryError;

    for (let i = 0; i < entry.fallbacks.length; i++) {
      const fallbackEntry = entry.fallbacks[i];
      const candidate = buildLocatorFromEntry(page, fallbackEntry);
      try {
        await candidate.waitFor({ state: 'visible', timeout: timeoutMs });
        // Candidate resolved — we're committed to healing via this fallback regardless of
        // whether logging it succeeds, so logging failures must never fall through to the
        // "try the next fallback" catch below.
        console.log(
          `[SELF-HEALED] spec=${specRelativePath} element=${elementKey} fallback#${i} ` +
          `strategy=${fallbackEntry.strategy} — primary locator failed, fallback worked (no AI used)`
        );
        try {
          recordHealingEvent({
            spec: specRelativePath,
            elementKey,
            oldPrimary: entry.primary,
            newPrimary: fallbackEntry,
            fallbackIndex: i,
            timestamp: new Date().toISOString(),
          });
        } catch (logError) {
          console.warn(`Failed to record healing event (healing still applied): ${logError}`);
        }
        return candidate;
      } catch {
        // this fallback didn't resolve either — try the next one.
      }
    }
    throw primaryError;
  }
}

function recordHealingEvent(event: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(healingLogPath), { recursive: true });
  fs.appendFileSync(healingLogPath, `${JSON.stringify(event)}\n`);
}
