import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/rrr.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/rrr.json for
// each element's fallback locators.
test('rrr', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.locator('#onetrust-button-group'))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('button:nth-of-type(2) > span'))).click();
});
