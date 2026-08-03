import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/zaqqq.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/zaqqq.json for
// each element's fallback locators.
test('zaqqq', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('div:nth-of-type(4) > div > form > div:nth-of-type(4) > button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('a > img'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-l-s-away-shirt-2026-27-adults?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy');
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > button:nth-of-type(2)'))).click();
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-l-s-away-shirt-2026-27-adults?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC85MA==');
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('div > div > div:nth-of-type(3) > div:nth-of-type(3) > button > span:nth-of-type(1)'))).click();
  await (await resilientLocator(page, SPEC, 'element6', () => page.locator('button > span'))).click();
  await page.goto('https://shop.lcfc.com/en/cart');
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button > span:nth-of-type(1)'))).click();
  await page.goto('https://shop.lcfc.com/en/checkout/secure');
  await (await resilientLocator(page, SPEC, 'element8', () => page.locator('div > span'))).click();
  await (await resilientLocator(page, SPEC, 'element9', () => page.getByRole('radio'))).click();
  await (await resilientLocator(page, SPEC, 'element10', () => page.getByRole('radio'))).fill('guest');
  await (await resilientLocator(page, SPEC, 'element11', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element12', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element13', () => page.getByRole('textbox'))).fill('test@test.com');
  await (await resilientLocator(page, SPEC, 'element14', () => page.locator('button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element15', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element16', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element17', () => page.getByRole('textbox'))).fill('fahad@gmail.com');
  await (await resilientLocator(page, SPEC, 'element18', () => page.locator('button > span'))).click();
  await (await resilientLocator(page, SPEC, 'element19', () => page.getByRole('textbox'))).click();
  await (await resilientLocator(page, SPEC, 'element20', () => page.getByRole('textbox'))).fill('fahad.hussain@gmail.com');
  await (await resilientLocator(page, SPEC, 'element21', () => page.locator('button > span'))).click();
});
