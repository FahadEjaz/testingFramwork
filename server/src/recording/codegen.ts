// Turns a recorded action list into a `.spec.ts` + manifest pair (Phase 6 — see PLAN.md).
// Reuses `scripts/lib/manifest.js`'s `codeForEntry` so the emitted locator source is byte-for-
// byte the same code generation Phase 2's healing-patch script already uses — one place decides
// what "the code for this locator" looks like.
import type { RecordedAction } from './session';

const path = require('path');
const { codeForEntry } = require('../../../scripts/lib/manifest.js');

export interface LocatorCandidate {
  strategy: 'role' | 'testId' | 'css' | 'text' | 'label' | 'placeholder';
  role?: string;
  name?: string;
  value?: string;
}

export interface ManifestElement {
  primary: LocatorCandidate;
  fallbacks: LocatorCandidate[];
}

export interface GeneratedManifest {
  spec: string;
  elements: Record<string, ManifestElement>;
}

export interface GeneratedTest {
  specPath: string;
  specSource: string;
  manifestPath: string;
  manifest: GeneratedManifest;
}

// The in-page recorder tries hard to always surface >=3 distinct candidates, but a fully
// generic, unattributed element (no id/role/name/placeholder) can still bottom out at 2 — pad
// with a deliberately-unmatchable filler so the manifest always satisfies schema.json's
// `fallbacks` minItems:2. Self-healing never depends on this: it's only ever reached after the
// primary and every real fallback already failed.
function ensureMinCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  const padded = [...candidates];
  let n = 0;
  while (padded.length < 3) {
    padded.push({ strategy: 'text', value: `__no-fallback-recorded-${n++}__` });
  }
  return padded;
}

function specFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'recorded-test'}.spec.ts`;
}

function jsStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function methodCallFor(action: RecordedAction): string {
  switch (action.type) {
    case 'click':
      return '.click()';
    case 'fill':
      return `.fill(${jsStringLiteral(action.value ?? '')})`;
    case 'selectOption':
      return `.selectOption(${jsStringLiteral(action.value ?? '')})`;
    default:
      throw new Error(`Unknown recorded action type: ${(action as RecordedAction).type}`);
  }
}

function generateTest(name: string, startUrl: string, actions: RecordedAction[]): GeneratedTest {
  const specPath = path.posix.join('tests', specFileName(name));
  const manifestPath = path.posix.join('manifests', specFileName(name).replace(/\.spec\.ts$/, '.json'));

  const elements: Record<string, ManifestElement> = {};
  const steps: string[] = [];
  let lastUrl = startUrl;

  actions.forEach((action, index) => {
    const elementKey = `element${index + 1}`;
    const candidates = ensureMinCandidates(action.candidates as LocatorCandidate[]);
    const [primary, ...fallbacks] = candidates;
    elements[elementKey] = { primary, fallbacks: fallbacks.slice(0, 3) };

    if (action.url && action.url !== lastUrl) {
      steps.push(`  await page.goto(${jsStringLiteral(action.url)});`);
      lastUrl = action.url;
    }

    const primaryCode = codeForEntry(primary);
    steps.push(
      `  await (await resilientLocator(page, SPEC, ${jsStringLiteral(elementKey)}, () => ${primaryCode}))${methodCallFor(
        action
      )};`
    );
  });

  const specSource = `import { test, expect } from '@playwright/test';
import { resilientLocator } from './support/resilient-locator';

const SPEC = ${jsStringLiteral(specPath)};

// Recorded via the in-app recorder (Phase 6) — see manifests/${path.basename(manifestPath)} for
// each element's fallback locators.
test(${jsStringLiteral(name)}, async ({ page }) => {
  await page.goto(${jsStringLiteral(startUrl)});
${steps.join('\n')}
});
`;

  return {
    specPath,
    specSource,
    manifestPath,
    manifest: { spec: specPath, elements },
  };
}

module.exports = { generateTest };
