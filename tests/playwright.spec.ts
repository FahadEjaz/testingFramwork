import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/playwright.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/playwright.json for
// each element's fallback locators.
test('playwright', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('link', { name: 'Get started' }))).click();
  await page.goto('https://playwright.dev/docs/intro');
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('link', { name: 'How to open the HTML test report' }))).click();
});
