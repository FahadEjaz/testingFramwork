import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/tttttt.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/tttttt.json for
// each element's fallback locators.
test('tttttt', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('textbox'))).fill('fahad');
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByRole('textbox'))).fill('fahad@123');
  await (await resilientLocator(page, SPEC, 'element3', () => page.getByRole('combobox'))).click();
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('span > img'))).click();
});
