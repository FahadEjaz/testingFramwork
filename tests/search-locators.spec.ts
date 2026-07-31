import { test, expect } from './support/fixtures';

// Recorded-style test (raw locators, no Page Object) exercising the DocSearch modal — validates
// the manifest schema/generator against a mix of role (button/searchbox/link) and heading locators.
test('search finds and opens the Locators guide', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  await page.getByRole('button', { name: 'Search (Control+k)' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('locators');
  await page.getByRole('link', { name: 'Locators', exact: true }).click();

  await expect(page).toHaveURL(/\/docs\/locators$/);
  await expect(page.getByRole('heading', { name: 'Locators', level: 1 })).toBeVisible();
});
