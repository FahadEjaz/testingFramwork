import { defineConfig, devices } from '@playwright/test';

/**
 * Config used only for web-app-triggered runs (server/src/runner.ts), never for `npm test`/CI —
 * those keep using playwright.config.ts untouched. Kept separate rather than parameterizing the
 * base config because trace/video capture is expensive and per-run output/report dirs need to
 * be app-controlled (server/data/runs/<runId>/...), not the repo-root test-results/playwright-
 * report/ dirs the base config defaults to (the latter has a recurring root-ownership problem
 * from earlier Docker sessions — see PROGRESS.md — this sidesteps it by never writing there).
 */
const outputDir = process.env.PW_RUN_OUTPUT_DIR || 'test-results';
const reportDir = process.env.PW_RUN_REPORT_DIR || 'playwright-report';

export default defineConfig({
  testDir: './tests',
  retries: 0,
  workers: 1,
  outputDir,
  reporter: [['json'], ['html', { open: 'never', outputFolder: reportDir }]],
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
