// Unit tests for the Phase 9 scoped-context extractor (scripts/lib/dom-context.js) — must pull
// only a small, pruned snapshot of interactive elements, never the full page HTML/scripts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { extractDomContext } = require('../../scripts/lib/dom-context');

// This file's page.evaluate() callback runs in the browser, not Node — no DOM lib is configured
// in tsconfig.json for server/test/**, same as server/src/recording/recorderScript.ts's own
// `declare const document: any`.
declare const document: any;

const FIXTURE_HTML =
  '<!doctype html><html><body>' +
  '<script>window.secretGlobal = "should-never-appear";</script>' +
  '<style>.hidden-rule { color: red; }</style>' +
  '<button data-testid="go-btn" aria-label="Go">Go</button>' +
  '<input type="text" placeholder="Search" />' +
  '<a href="/next">Next page</a>' +
  '<p>Some plain paragraph text, not interactive.</p>' +
  '</body></html>';

async function withPage(fn: (page: any) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);
    await fn(page);
  } finally {
    await browser.close();
  }
}

test(
  'extractDomContext returns only interactive elements with pruned attributes',
  async () => {
    await withPage(async (page) => {
      const context = await extractDomContext(page);
      const parsed = JSON.parse(context);

      assert.ok(Array.isArray(parsed));
      const tags = parsed.map((el: any) => el.tag).sort();
      assert.deepEqual(tags, ['a', 'button', 'input']);

      const button = parsed.find((el: any) => el.tag === 'button');
      assert.equal(button.attrs['data-testid'], 'go-btn');
      assert.equal(button.attrs['aria-label'], 'Go');
      assert.equal(button.text, 'Go');
    });
  }
);

test(
  'extractDomContext never leaks script/style contents',
  async () => {
    await withPage(async (page) => {
      const context = await extractDomContext(page);
      assert.doesNotMatch(context, /secretGlobal/);
      assert.doesNotMatch(context, /hidden-rule/);
    });
  }
);

test(
  'extractDomContext caps output size regardless of element count',
  async () => {
    await withPage(async (page) => {
      await page.evaluate(() => {
        for (let i = 0; i < 500; i++) {
          const btn = document.createElement('button');
          btn.textContent = `Button number ${i} with some extra padding text to inflate size`;
          document.body.appendChild(btn);
        }
      });
      const context = await extractDomContext(page, { maxChars: 2000 });
      assert.ok(context.length <= 2000);
    });
  }
);
