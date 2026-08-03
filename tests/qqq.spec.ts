import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/qqq.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/qqq.json for
// each element's fallback locators.
test('qqq', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element4', () => page.getByRole('button', { name: 'XS (4-6)' }))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC8xMTA=');
  await (await resilientLocator(page, SPEC, 'element5', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button > span:nth-of-type(1)'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.locator('div:nth-of-type(4) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element9', () => page.locator('button > span'))).click();
  await page.goto('https://shop.lcfc.com/en/cart');
  await (await resilientLocator(page, SPEC, 'element10', () => page.locator('button > span:nth-of-type(1)'))).click();
  await page.goto('https://shop.lcfc.com/en/checkout/secure');
  await (await resilientLocator(page, SPEC, 'element11', () => page.locator('div > span'))).click();
  await (await resilientLocator(page, SPEC, 'element12', () => page.getByRole('radio'))).click();
  await (await resilientLocator(page, SPEC, 'element13', () => page.getByRole('radio'))).fill('guest');
  await (await resilientLocator(page, SPEC, 'element14', () => page.getByRole('textbox'))).click();
});
