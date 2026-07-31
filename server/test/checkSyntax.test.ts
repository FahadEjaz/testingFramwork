// Unit tests for scripts/lib/check-syntax.js, the syntax-only validator gating in-app script
// edits (server/src/routes/tests.ts's PATCH /tests/:id/source).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSyntax } = require('../../scripts/lib/check-syntax');

test('valid TypeScript/Playwright source has no diagnostics', () => {
  const source = "import { test } from '@playwright/test';\ntest('a', async ({ page }) => { await page.goto('x'); });\n";
  assert.deepEqual(checkSyntax(source), []);
});

test('a dangling expression is reported with a line/column', () => {
  const diagnostics = checkSyntax('const x = ;');
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0], /^Line 1, Col \d+: /);
});

test('an unclosed brace is reported', () => {
  const diagnostics = checkSyntax("test('a', async () => {\n");
  assert.ok(diagnostics.length > 0);
});
