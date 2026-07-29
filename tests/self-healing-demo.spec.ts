import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/self-healing-demo.spec.ts';

// Demonstrates Phase 2's deterministic self-healing pipeline (REQUIREMENTS.md 3.3): the
// primary locator below is deliberately a stale CSS selector, so this test exercises the
// fallback chain from manifests/self-healing-demo.json end to end — no AI involved.
test('get started link is found via fallback after a broken primary locator', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  const getStarted = await resilientLocator(
    page,
    SPEC,
    'getStartedLink',
    () => page.locator('a.getStarted_SOMESTALECLASS') // intentionally broken primary
  );

  await expect(getStarted).toBeVisible();
  await getStarted.click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
