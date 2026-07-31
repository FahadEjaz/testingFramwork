import { test, expect } from './support/fixtures';
import { resilientLocator } from './support/resilient-locator';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const aiHealClient = require('../scripts/lib/ai-heal-client');

const SPEC = 'tests/ai-healing-demo.spec.ts';

// Deliberately no network dependency (unlike self-healing-demo.spec.ts's playwright.dev target):
// a local fixture page whose primary AND both manifest fallbacks are broken on purpose, so this
// exercises Phase 9's AI escalation step (REQUIREMENTS.md 3.3 step 4) rather than Phase 2's
// fallback chain. The AI call itself is faked (see below) so this runs deterministically in CI
// with no ANTHROPIC_API_KEY required — the "AI unavailable" test below covers that case for real.
const FIXTURE_HTML = '<!doctype html><html><body><button data-testid="confirm-btn">Confirm</button></body></html>';

test.describe('Phase 9 — AI healing escalation', () => {
  test('heals via a scoped AI call when every deterministic fallback fails', async ({ page }) => {
    await page.setContent(FIXTURE_HTML);

    const original = aiHealClient.requestHealedLocator;
    aiHealClient.requestHealedLocator = async () => ({
      entry: { strategy: 'testId', value: 'confirm-btn' },
      usage: { inputTokens: 42, outputTokens: 7 },
    });

    try {
      const confirm = await resilientLocator(
        page,
        SPEC,
        'confirmButton',
        () => page.locator('.this-does-not-exist'), // intentionally broken primary
        { timeoutMs: 500 }
      );
      await expect(confirm).toBeVisible();
      await expect(confirm).toHaveText('Confirm');
    } finally {
      aiHealClient.requestHealedLocator = original;
    }
  });

  test('fails with the original error when AI escalation is unavailable (no API key)', async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    delete process.env.ANTHROPIC_API_KEY;

    await expect(
      resilientLocator(page, SPEC, 'confirmButton', () => page.locator('.this-does-not-exist'), { timeoutMs: 500 })
    ).rejects.toThrow();
  });
});
