#!/usr/bin/env node
// Layman-friendly test recorder: no terminal typing required beyond launching this script.
// Pops two plain-English dialog boxes (URL, test name), opens a real browser with Playwright's
// built-in Codegen recorder attached, saves the recorded test under tests/, then automatically
// scaffolds a starter manifest for it via generate-manifest.js.
//
// Requires zenity (Linux desktop dialogs). Launch by double-clicking scripts/record-test.sh.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');

function zenityEntry(text, title) {
  const result = spawnSync('zenity', ['--entry', `--title=${title}`, `--text=${text}`, '--width=400'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function zenityInfo(text, title) {
  spawnSync('zenity', ['--info', `--title=${title}`, `--text=${text}`, '--width=420']);
}

function zenityError(text, title) {
  spawnSync('zenity', ['--error', `--title=${title}`, `--text=${text}`, '--width=420']);
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function main() {
  if (spawnSync('which', ['zenity']).status !== 0) {
    console.error(
      'zenity not found. This recorder needs a Linux desktop with zenity installed for the ' +
      'pop-up prompts (install with e.g. `sudo apt install zenity`). Developers who just want ' +
      'the CLI can run `npx playwright codegen <url>` directly instead.'
    );
    process.exit(1);
  }

  const url = zenityEntry('Enter the web address (URL) you want to record a test for:', 'Record a new test — step 1 of 2');
  if (!url) return zenityInfo('Recording cancelled — no web address entered.', 'Cancelled');

  const rawName = zenityEntry('Give this test a short name (e.g. "login flow"):', 'Record a new test — step 2 of 2');
  if (!rawName) return zenityInfo('Recording cancelled — no test name entered.', 'Cancelled');

  const slug = slugify(rawName);
  if (!slug) return zenityError('That name didn’t contain any letters or numbers. Try again with a different name.', 'Invalid name');

  const specRelative = path.join('tests', `${slug}.spec.ts`);
  const specPath = path.join(repoRoot, specRelative);
  if (fs.existsSync(specPath)) {
    return zenityError(`tests/${slug}.spec.ts already exists. Pick a different name and try again.`, 'Name already used');
  }

  zenityInfo(
    'A browser window is about to open with a recorder panel attached.\n\n' +
    'Click through the app the way a real user would — every click, type, and check gets ' +
    'turned into test code automatically.\n\n' +
    'When you’re done, just close the browser window.',
    'Ready to record'
  );

  const codegenResult = spawnSync('npx', ['playwright', 'codegen', url, '--output', specRelative], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (codegenResult.status !== 0 || !fs.existsSync(specPath)) {
    return zenityError('Recording didn’t produce a test file — nothing was saved.', 'Recording failed');
  }

  zenityInfo(`Saved your recorded test to tests/${slug}.spec.ts.\n\nNow generating a fallback-locator manifest…`, 'Recording saved');

  const manifestResult = spawnSync('node', [path.join(__dirname, 'generate-manifest.js'), specRelative], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (manifestResult.status === 0) {
    zenityInfo(
      `${manifestResult.stdout}\nA developer should review the manifest's TODO fallback values, and ` +
      'consider refactoring the recorded steps into a Page Object, before this test is relied on.',
      'Manifest scaffolded'
    );
  } else {
    zenityInfo(
      `Test saved, but manifest scaffolding didn’t run cleanly:\n${manifestResult.stderr || manifestResult.stdout}`,
      'Manifest scaffolding skipped'
    );
  }
}

main();
