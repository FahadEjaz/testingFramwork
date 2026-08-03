import type { Page } from '@playwright/test';

const CLOSE_SELECTORS = [
  'button:has-text("OK")',
  'button[aria-label="Close"]',
  'button.action-close',
  '.modal-header button.action-close',
  '[data-role="closeBtn"]',
  'button:has-text("Accept")',
  'button:has-text("Accept All")',
];

/**
 * Best-effort dismissal of whatever overlay the live site happens to show this run (dealer
 * "no locations found" info dialog, cookie consent, promo/newsletter modal) — these appear
 * unpredictably and block clicks on the element underneath. Never throws: a step here failing
 * just means one fewer popup got closed, not a test failure.
 *
 * The OneTrust cookie banner in particular fades in ~2.5s after page load rather than being
 * present at domcontentloaded, so an instant isVisible() check right after navigation misses
 * it — it then sits there intercepting pointer events on later clicks. Wait concurrently (not
 * per-selector serially) for any popup to appear before the close pass.
 */
export async function dismissPopups(page: Page): Promise<void> {
  await Promise.all(
    CLOSE_SELECTORS.map((selector) =>
      page
        .locator(selector)
        .first()
        .waitFor({ state: 'visible', timeout: 2500 })
        .catch(() => {})
    )
  );
  for (const selector of CLOSE_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 1000 }).catch(() => {});
    }
  }
}
