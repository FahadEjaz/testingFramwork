import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/pay.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/pay.json for
// each element's fallback locators.
test('pay', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.locator('#__docusaurus_skipToContent_fallback'))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('link', { name: 'Get started' }))).click();
  await page.goto('https://playwright.dev/docs/intro');
  await (await resilientLocator(page, SPEC, 'element3', () => page.getByText('How to install Playwright What\'s installed How to run the example test How to op'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.getByRole('link', { name: 'How to open the HTML test report' }))).click();
});
