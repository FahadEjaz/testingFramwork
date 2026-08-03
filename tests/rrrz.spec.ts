import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/rrrz.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/rrrz.json for
// each element's fallback locators.
test('rrrz', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('div:nth-of-type(4) > div > form > div:nth-of-type(4) > button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('#custom-name'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('#custom-name'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.getByRole('button', { name: 'S (8-10)' }))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC8xMTE=');
  await (await resilientLocator(page, SPEC, 'element7', () => page.getByText('Share'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.locator('div > div > div:nth-of-type(3) > div:nth-of-type(3) > button > span:nth-of-type(1)'))).click();
});
