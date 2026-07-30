import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = 'tests/rfff.spec.ts';

// Recorded via the in-app recorder (Phase 6) — see manifests/rfff.json for
// each element's fallback locators.
test('rfff', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await (await resilientLocator(page, SPEC, 'element1', () => page.getByRole('combobox', { name: 'Search' }))).click();
  await (await resilientLocator(page, SPEC, 'element2', () => page.locator('div:nth-of-type(1) > span'))).click();
  await page.goto('https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3Dfbr%2Bsmall%2Bshopkeepers%2Btax%2Bscheme%26sca_esv%3D2c719d755bc25006%26source%3Dhp%26ei%3DJgBrar6fGsqE1sQPkPb4yAU%26iflsig%3DABILxe8AAAAAamsONvqWRod7eKO8n0n7zNFbSmN0pFXy%26gs_ss%3D1%26oq%3D%26gs_lp%3DEgdnd3Mtd2l6IgAqAggAMgoQABgDGI8BGOoCMgoQLhgDGI8BGOoCMgoQLhgDGI8BGOoCMgoQABgDGI8BGOoCMgoQLhgDGI8BGOoCMgoQABgDGI8BGOoCMgoQABgDGI8BGOoCMgoQABgDGI8BGOoCMgoQABgDGI8BGOoCMgoQABgDGI8BGOoCSJwbUABYAHABeACQAQCYAQCgAQCqAQC4AQHIAQCYAgGgAg6oAgqYAw7xBdEyqVMJBr0lkgcBMaAHALIHALgHAMIHAzMtMcgHC4AIAQ%26sclient%3Dgws-wiz%26sei%3DMABraqn4EuHIp84Pts3J6QM&q=EgRvXIkkGLGArNMGIjCRL1WALvi7N5UKXz8vqNv9rul5IKcJXzesVkfWSsKTz-rQuM1bAYTbAqS8gokSVqYyAVJaAUM');
  await (await resilientLocator(page, SPEC, 'element3', () => page.locator('div:nth-of-type(1) > div'))).click();
  await page.goto('https://www.google.com/recaptcha/enterprise/bframe?hl=en&v=A7KpaEASfhDcK0nXxgQEyyYv&k=6LdLLIMbAAAAAIl-KLj9p1ePhM-4LCCDbjtJLqRO&bft=0dAFcWeA5gOqQJuBdRomJXtB7nSBfy_pifhxapSvCJiljKbyMD0-G9bAFc9kLIWjp9KmiISUCTHyF4ZwCHz9PDkqHcs9a9gPS-tg');
  await (await resilientLocator(page, SPEC, 'element4', () => page.locator('div:nth-of-type(1) > img'))).click();
  await (await resilientLocator(page, SPEC, 'element5', () => page.getByRole('button', { name: 'Verify' }))).click();
});
