// Phase 10's base test fixture (REQUIREMENTS.md 3.7): every spec that imports `test`/`expect`
// from here — instead of directly from `@playwright/test` — gets an automatic accessibility scan
// of whatever page state remains once the test body finishes, with zero AI involvement. Purely
// observational: a violation never fails the test itself (a target site's own pre-existing a11y
// issues aren't something this framework should silently start failing CI over); results are
// attached to the test's Playwright report entry, which is what the app's report view (Phase 7)
// already embeds — no separate reporting path to build.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);

    try {
      const results = await new AxeBuilder({ page }).analyze();
      // AxeBuilder's raw `analyze()` output includes full rule metadata for every check that
      // *passed* too (megabytes of noise on a real page) — only `violations` is ever actionable,
      // so that's what's worth keeping in the report; pass/incomplete/inapplicable are summarized
      // as counts only.
      await testInfo.attach('accessibility-scan', {
        body: JSON.stringify(
          {
            url: results.url,
            violations: results.violations,
            passes: results.passes.length,
            incomplete: results.incomplete.length,
            inapplicable: results.inapplicable.length,
          },
          null,
          2
        ),
        contentType: 'application/json',
      });
      if (results.violations.length > 0) {
        testInfo.annotations.push({
          type: 'accessibility-violations',
          description: `${results.violations.length} violation(s): ${results.violations.map((v) => v.id).join(', ')}`,
        });
      }
    } catch (err) {
      // Best-effort observability only — a scan failure (e.g. the page navigated away or closed
      // during teardown) must never change the actual test's pass/fail result.
      console.warn(`Accessibility scan failed for "${testInfo.title}": ${err}`);
    }
  },
});

export { expect };
