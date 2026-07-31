import { test, expect } from './support/fixtures';

// Recorded-style test (raw locators, no Page Object) exercising the nav bar's theme toggle —
// validates the manifest schema/generator against a role locator with no fixed accessible name
// suffix (the button's name changes after each click: "...currently light/dark mode").
test('theme toggle switches from system mode to an explicit mode', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  const themeToggle = page.getByRole('button', { name: 'Switch between dark and light mode' });
  await expect(themeToggle).toBeVisible();

  await themeToggle.click();

  await expect(
    page.getByRole('button', { name: 'currently light mode' }).or(
      page.getByRole('button', { name: 'currently dark mode' })
    )
  ).toBeVisible();
});
