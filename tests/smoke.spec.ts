import { test, expect } from '@playwright/test';
import { PlaywrightHomePage } from './pages/PlaywrightHomePage';

// Phase 0 scaffolding proof: a trivial recorded-style test with a Page Object,
// used only to confirm the pipeline (local + Docker + CI) runs green end-to-end.
test('homepage has Get started link that leads to the docs', async ({ page }) => {
  const home = new PlaywrightHomePage(page);
  await home.goto();

  await expect(home.getStartedLink).toBeVisible();
  await home.clickGetStarted();

  await expect(home.heading).toBeVisible();
});
