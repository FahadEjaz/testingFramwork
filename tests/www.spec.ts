import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/www.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/www.json for
// each element's fallback locators.
test('www', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('div:nth-of-type(4) > div > form > div:nth-of-type(4) > button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.getByText('__no-fallback-recorded-0__'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element4', () => page.getByRole('button', { name: 'XS (4-6)' }))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC8xMTA=');
  await (await resilientLocator(page, SPEC, 'element5', () => page.getByText('Add to bag'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.getByText('__no-fallback-recorded-0__'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.getByRole('textbox'))).fill('FAHAD');
  await (await resilientLocator(page, SPEC, 'element9', () => page.getByRole('button', { name: 'Add to bag£80.00' }))).click();
  await (await resilientLocator(page, SPEC, 'element10', () => page.getByText('View bag'))).click();
  await page.goto('https://shop.lcfc.com/en/cart');
  await (await resilientLocator(page, SPEC, 'element11', () => page.getByText('Proceed to checkout'))).click();
});
