#!/usr/bin/env node
// Scans a .spec.ts file (and any Page Object it imports from ./pages/) for locator calls and
// scaffolds a starter manifests/<spec-name>.json — see manifests/schema.json for the shape.
// Fallback locators are heuristic placeholders (marked TODO): this script has no access to the
// live DOM, so it cannot guess real test-id/CSS values — a human must fill those in before the
// manifest is trusted for self-healing (Phase 2+).
//
// Usage: node scripts/generate-manifest.js tests/<spec-name>.spec.ts [--force]
const fs = require('fs');
const path = require('path');
const { extractLocators } = require('./lib/extract-locators');
const { manifestPathForSpec } = require('./lib/manifest');

const STRATEGY_PRIORITY = ['testId', 'css', 'role', 'text'];

function kebabCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function buildFallbacks(primary, elementName) {
  return STRATEGY_PRIORITY.filter((s) => s !== primary.strategy)
    .slice(0, 2)
    .map((strategy) => {
      if (strategy === 'role') return { strategy, role: 'TODO', name: 'TODO: fill in accessible name' };
      if (strategy === 'testId') return { strategy, value: `TODO-${kebabCase(elementName)}` };
      return { strategy, value: `TODO: fill in a ${strategy} value for ${elementName}` };
    });
}

function collectFilesToScan(specPath, specSource) {
  const files = [{ path: specPath, source: specSource }];
  const specDir = path.dirname(specPath);
  const importRegex = /from\s+['"](\.\/pages\/[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(specSource))) {
    const pageObjectPath = path.resolve(specDir, `${match[1]}.ts`);
    if (fs.existsSync(pageObjectPath)) {
      files.push({ path: pageObjectPath, source: fs.readFileSync(pageObjectPath, 'utf8') });
    }
  }
  return files;
}

function main() {
  const specArg = process.argv[2];
  const force = process.argv.includes('--force');
  if (!specArg) {
    console.error('Usage: node scripts/generate-manifest.js <path-to-spec.ts> [--force]');
    process.exit(1);
  }

  const repoRoot = path.resolve(__dirname, '..');
  const specPath = path.resolve(repoRoot, specArg);
  const specRelative = path.relative(repoRoot, specPath).split(path.sep).join('/');

  if (!fs.existsSync(specPath)) {
    console.error(`Spec file not found: ${specRelative}`);
    process.exit(1);
  }

  const specSource = fs.readFileSync(specPath, 'utf8');
  const filesToScan = collectFilesToScan(specPath, specSource);

  const elements = {};
  for (const file of filesToScan) {
    for (const locator of extractLocators(file.source, file.path)) {
      const { elementName, inferred, ...primary } = locator;
      let key = elementName;
      let suffix = 1;
      while (elements[key]) {
        suffix += 1;
        key = `${name}${suffix}`;
      }
      elements[key] = { primary, fallbacks: buildFallbacks(primary, key) };
    }
  }

  if (Object.keys(elements).length === 0) {
    console.error(`No page.getBy*()/page.locator() calls found in ${specRelative} (or its Page Object). Nothing to scaffold.`);
    process.exit(1);
  }

  const manifest = { spec: specRelative, elements };
  const manifestPath = manifestPathForSpec(repoRoot, specRelative);

  if (fs.existsSync(manifestPath) && !force) {
    console.error(`${path.relative(repoRoot, manifestPath)} already exists — re-run with --force to overwrite.`);
    process.exit(1);
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const elementCount = Object.keys(elements).length;
  const todoCount = Object.values(elements).reduce(
    (n, el) => n + el.fallbacks.filter((f) => JSON.stringify(f).includes('TODO')).length,
    0
  );
  console.log(`Wrote ${path.relative(repoRoot, manifestPath)} with ${elementCount} element(s).`);
  if (todoCount > 0) {
    console.log(
      `${todoCount} fallback locator(s) are TODO placeholders — review and fill in real role/testId/css ` +
      'values before this manifest is relied on for self-healing.'
    );
  }
}

main();
