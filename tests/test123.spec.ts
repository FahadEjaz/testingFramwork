import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/test123.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/test123.json for
// each element's fallback locators.
test('test123', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Close' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('li:nth-of-type(1) > div > a > span > span > img'))).click();
  await page.goto('https://shop.stihl.com.au/bga-160-battery-blower-ap-system-skin-only');
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('div:nth-of-type(1) > div > div:nth-of-type(1) > span:nth-of-type(2) > button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('div:nth-of-type(1) > div > div:nth-of-type(1) > span:nth-of-type(2) > button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.getByText('Select Dealer'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.getByText('Select Store'))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.getByText('Home Hardware Karratha • Contact Dealer for availability 8/3813 Balmoral RoadKar'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.locator('div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(4) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element9', () => page.locator('div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(4) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element10', () => page.locator('div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(4) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element11', () => page.locator('div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(4) > div'))).click();
  await (await resilientLocator(page, SPEC, 'element12', () => page.getByRole('link', { name: 'About Us' }))).click();
});
