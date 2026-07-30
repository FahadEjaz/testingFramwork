import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/dddd.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/dddd.json for
// each element's fallback locators.
test('dddd', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('div > svg'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('div > div'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element6', () => page.locator('p:nth-of-type(1) > img'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('li:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.getByRole('link', { name: '2026/27 LCFC Women' }))).click();
  await page.goto('https://shop.lcfc.com/en/kit/away-kit/2026-27-lcfc-women-away');
  await (await resilientLocator(page, SPEC, 'element9', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-women-s-l-s-away-shirt-2026-27-adults?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element10', () => page.getByRole('link', { name: 'New In' }))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-new-arrivals');
  await (await resilientLocator(page, SPEC, 'element11', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/adidas-originals-pre-match-jersey-mens?OTM%3D=Y29uZmlndXJhYmxlLzkzLzQwMA==');
  await (await resilientLocator(page, SPEC, 'element12', () => page.locator('p:nth-of-type(1) > img'))).click();
  await (await resilientLocator(page, SPEC, 'element13', () => page.locator('div > svg'))).click();
  await (await resilientLocator(page, SPEC, 'element14', () => page.locator('#zoom'))).click();
  await (await resilientLocator(page, SPEC, 'element15', () => page.getByRole('button', { name: 'Close Zoom Images' }))).click();
});
