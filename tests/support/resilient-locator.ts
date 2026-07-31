import type { Page, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadManifestForSpec, buildLocatorFromEntry } = require('../../scripts/lib/manifest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractDomContext } = require('../../scripts/lib/dom-context');
// Referenced as a module namespace (not destructured) so tests can monkey-patch
// aiHealClient.requestHealedLocator with a fake before exercising this file, the same way
// scripts/lib/ai-heal-client.js's own deps.client seam lets its unit tests avoid a real API call.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const aiHealClient = require('../../scripts/lib/ai-heal-client');

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
            source: 'fallback',
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

    // Step 4 (REQUIREMENTS.md 3.3): every deterministic fallback failed — one scoped AI call,
    // only on this failure path, never on a normal run. Best-effort: missing API key, a network
    // error, a malformed AI response, or the AI's own candidate still not resolving all fall
    // through to the original failure below rather than changing how the test fails.
    try {
      const domContext = await extractDomContext(page);
      const { entry: aiEntry, usage } = await aiHealClient.requestHealedLocator({
        elementKey,
        oldPrimary: entry.primary,
        domContext,
      });
      const candidate = buildLocatorFromEntry(page, aiEntry);
      await candidate.waitFor({ state: 'visible', timeout: timeoutMs });

      console.log(
        `[AI-HEALED] spec=${specRelativePath} element=${elementKey} strategy=${aiEntry.strategy} ` +
        `— every fallback failed, AI proposed a fix (tokens: in=${usage.inputTokens} out=${usage.outputTokens})`
      );
      try {
        recordHealingEvent({
          spec: specRelativePath,
          elementKey,
          oldPrimary: entry.primary,
          newPrimary: aiEntry,
          // No existing fallback slot to demote — this locator didn't come from the manifest.
          fallbackIndex: -1,
          source: 'ai',
          tokensUsed: usage,
          timestamp: new Date().toISOString(),
        });
      } catch (logError) {
        console.warn(`Failed to record AI healing event (healing still applied): ${logError}`);
      }
      return candidate;
    } catch (aiError) {
      console.warn(`AI healing escalation did not resolve ${specRelativePath}::${elementKey}: ${aiError}`);
    }

    throw primaryError;
  }
}

function recordHealingEvent(event: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(healingLogPath), { recursive: true });
  fs.appendFileSync(healingLogPath, `${JSON.stringify(event)}\n`);
}
