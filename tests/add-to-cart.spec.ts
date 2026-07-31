import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/add-to-cart.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/add-to-cart.json for
// each element's fallback locators.
test('Add to Cart', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Close' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('link', { name: 'BGA 160 Battery Blower AP-System Skin Only' }))).click();
  await page.goto('https://shop.stihl.com.au/bga-160-battery-blower-ap-system-skin-only');
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('div > span:nth-of-type(2)'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('div:nth-of-type(1) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.getByRole('button', { name: 'Confirm selection' }))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.locator('div > div'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button > span'))).click();
});
