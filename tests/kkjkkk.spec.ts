import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/kkjkkk.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/kkjkkk.json for
// each element's fallback locators.
test('kkjkkk', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Close' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('link', { name: 'FSA 120 R Battery Grass Trimmer AP-System Skin Only' }))).click();
  await page.goto('https://shop.stihl.com.au/fsa-120-r-battery-grass-trimmer-ap-system-skin-only');
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('div > span:nth-of-type(2)'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('body > div:nth-of-type(1)'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.locator('div > div'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.locator('button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element9', () => page.getByRole('button', { name: 'Add to Cart' }))).click();
});
