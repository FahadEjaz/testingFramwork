import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/lcfc-add-to-cart.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/lcfc-add-to-cart.json for
// each element's fallback locators.
test('lcfc add to cart', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('span > p'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC8xMTA=');
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('button > span:nth-of-type(1)'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.locator('button > span'))).click();
});
