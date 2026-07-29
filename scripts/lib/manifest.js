// Shared helpers for reading/writing locator manifests and turning a manifest entry into a
// real Playwright Locator (or the source code for one) — see manifests/schema.json.
const fs = require('fs');
const path = require('path');

function manifestPathForSpec(repoRoot, specRelativePath) {
  const base = path.basename(specRelativePath, '.spec.ts');
  return path.join(repoRoot, 'manifests', `${base}.json`);
}

function loadManifestForSpec(repoRoot, specRelativePath) {
  const manifestPath = manifestPathForSpec(repoRoot, specRelativePath);
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return { manifestPath, data };
}

function saveManifest(manifestPath, data) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`);
}

// entry -> real Playwright Locator, for use at test runtime.
function buildLocatorFromEntry(page, entry) {
  switch (entry.strategy) {
    case 'role':
      return entry.name ? page.getByRole(entry.role, { name: entry.name }) : page.getByRole(entry.role);
    case 'testId':
      return page.getByTestId(entry.value);
    case 'css':
      return page.locator(entry.value);
    case 'text':
      return page.getByText(entry.value);
    case 'label':
      return page.getByLabel(entry.value);
    case 'placeholder':
      return page.getByPlaceholder(entry.value);
    default:
      throw new Error(`Unknown locator strategy: ${entry.strategy}`);
  }
}

function jsStringLiteral(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// entry -> the Playwright source code that would build the equivalent Locator, for patching
// a .spec.ts file's resilientLocator(...) call after a healing event.
function codeForEntry(entry) {
  switch (entry.strategy) {
    case 'role':
      return entry.name
        ? `page.getByRole(${jsStringLiteral(entry.role)}, { name: ${jsStringLiteral(entry.name)} })`
        : `page.getByRole(${jsStringLiteral(entry.role)})`;
    case 'testId':
      return `page.getByTestId(${jsStringLiteral(entry.value)})`;
    case 'css':
      return `page.locator(${jsStringLiteral(entry.value)})`;
    case 'text':
      return `page.getByText(${jsStringLiteral(entry.value)})`;
    case 'label':
      return `page.getByLabel(${jsStringLiteral(entry.value)})`;
    case 'placeholder':
      return `page.getByPlaceholder(${jsStringLiteral(entry.value)})`;
    default:
      throw new Error(`Unknown locator strategy: ${entry.strategy}`);
  }
}

module.exports = {
  manifestPathForSpec,
  loadManifestForSpec,
  saveManifest,
  buildLocatorFromEntry,
  codeForEntry,
};
