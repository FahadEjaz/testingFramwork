// Scoped-context extractor for the AI healing escalation path (Phase 9 — REQUIREMENTS.md 3.3
// step 4 / 4's "no full page" security requirement). Only ever called after every deterministic
// manifest fallback has already failed; pulls a small, pruned snapshot of interactive elements
// currently on the page — never the full page HTML, never <script>/<style> contents.
const { redactSecrets } = require('./redact');

const MAX_ELEMENTS = 40;
const MAX_CHARS = 6000;
const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,[role],[data-testid],label';
const ATTRS = ['id', 'class', 'role', 'name', 'type', 'placeholder', 'aria-label', 'data-testid', 'href'];

async function extractDomContext(page, opts = {}) {
  const maxElements = opts.maxElements ?? MAX_ELEMENTS;
  const maxChars = opts.maxChars ?? MAX_CHARS;

  const snapshot = await page.evaluate(
    ({ selector, attrNames, limit }) => {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, limit);
      return nodes.map((el) => {
        const attrs = {};
        for (const name of attrNames) {
          const value = el.getAttribute(name);
          if (value) attrs[name] = value;
        }
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        return { tag: el.tagName.toLowerCase(), attrs, text };
      });
    },
    { selector: INTERACTIVE_SELECTOR, attrNames: ATTRS, limit: maxElements }
  );

  const json = redactSecrets(JSON.stringify(snapshot));
  return json.length > maxChars ? json.slice(0, maxChars) : json;
}

module.exports = { extractDomContext };
