import { test, expect } from './support/fixtures';

// Phase 10 (REQUIREMENTS.md 3.6): Playwright's native pixel-diff assertions, no AI involvement.
// Scoped to the hero banner rather than a full-page shot — playwright.dev's own content (nav
// links, footer, ads-adjacent sections) shifts independently of anything this framework changes,
// which would make a full-page baseline noisy for reasons unrelated to what this test protects.
// See README.md for how to update the baseline after an intentional visual change.
test('playwright.dev hero banner matches its visual baseline', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  await expect(page.locator('header.hero')).toHaveScreenshot('hero-banner.png');
});
