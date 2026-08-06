import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/fahad.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/fahad.json for
// each element's fallback locators.
test('fahad', async ({ page }) => {
  await page.goto('https://shop.lcfc.com/en');
  try {
    await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Accept All' }))).click();
  } catch {}
  try {
    await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('button', { name: /select/i }))).click();
  } catch {}
  await (await resilientLocator(page, SPEC, 'element3', () => page.getByTestId('product-link').nth(4))).click({ force: true });
  await page.goto('https://shop.lcfc.com/en/leicester-city-men-s-away-shirt-2026-27-womens-fitted?OTM%3D=Y29uZmlndXJhYmxlLzkzLzEy&MTYw=Y29uZmlndXJhYmxlLzE2MC8xMTA=');
  await (await resilientLocator(page, SPEC, 'element4', () => page.getByRole('button', { name: 'XS (4-6)' }))).click();
  await page.waitForTimeout(1000);
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('.product__add-to-cart').first())).click();
  await page.waitForTimeout(2000);
  try {
    await page.getByRole('button', { name: 'Toggle cart sidebar' }).click();
  } catch {}
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button, a').filter({ hasText: /checkout/i }).first(), { timeoutMs: 15000 })).click({ force: true });
});
