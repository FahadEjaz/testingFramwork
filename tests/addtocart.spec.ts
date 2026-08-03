import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';
import { dismissPopups } from './support/dismiss-popups';

const SPEC = 'tests/addtocart.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/addtocart.json for
// each element's fallback locators.
test('AddToCart', async ({ page }) => {
  await page.goto('https://shop.stihl.com.au/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissPopups(page);
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('button', { name: 'Close' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.getByText('MS 182 Petrol Chainsaw'))).click();
  await page.goto('https://shop.stihl.com.au/ms-182-petrol-chainsaw', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissPopups(page);

  // Dealer/store selection is mandatory — Add to Cart stays disabled without it. The site's own
  // IP-geolocation lookup is environment-dependent (returns different/distant stores per network),
  // so search by a fixed address instead for a deterministic result across machines.
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('#dealer-search-menu a'))).click();
  await page.waitForLoadState('domcontentloaded');
  await dismissPopups(page);
  await page.locator('[data-amlocator-js="address"]').fill('Joondalup WA 6027');
  await page.locator('[data-amlocator-js="search"]').click();
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('[data-ampickup-js="chose-store-accordion-button"]').first())).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.locator('[data-ampickup-js="choose-store"]').first())).click();
  await dismissPopups(page);

  await page.goto('https://shop.stihl.com.au/ms-182-petrol-chainsaw', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissPopups(page);
  await (await resilientLocator(page, SPEC, 'element6', () => page.getByRole('button', { name: 'Add to Cart' }))).click();
  await (await resilientLocator(page, SPEC, 'element7', () => page.locator('button:nth-of-type(2) > span'))).click();
  await (await resilientLocator(page, SPEC, 'element8', () => page.getByRole('button', { name: 'Add to Cart' }))).click();
});
