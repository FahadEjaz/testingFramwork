import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/rrrrrrrrrrrrrrrrrrr.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/rrrrrrrrrrrrrrrrrrr.json for
// each element's fallback locators.
test('rrrrrrrrrrrrrrrrrrr', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Close' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByText('BGA 160 Battery Blower AP-System Skin Only As low as $449.00 $499.00 Collect Del'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('span > img'))).click();
});
