// Injected into the recorded page via `page.addInitScript` (Phase 6 — see PLAN.md). Watches
// clicks and form input/change on the real page and reports each one, with a handful of
// candidate locator strategies per element, to `window.__recordAction__` (wired up server-side
// via `page.exposeBinding` before this script runs — see session.ts). Deliberately heuristic,
// same spirit as `scripts/generate-manifest.js`'s TODO-marked fallbacks: good enough to save a
// human review, not a guarantee of a perfect locator.
//
// Kept as a plain function serialized to a string (via Function.prototype.toString) rather than
// a separate bundled asset — it only needs to run inside the recorded page, never on the server
// or in the React app, so there's no build step to wire up for it. Types below are ambient
// `any`-typed stand-ins for real DOM types: the repo's tsconfig deliberately has no "dom" lib
// (server code has no business touching a browser), and this function is never actually
// invoked in Node — only `.toString()`'d — so real DOM typing here buys nothing.
declare const window: any;
declare const document: any;
declare const location: any;
declare const Element: any;
declare const HTMLInputElement: any;
declare const HTMLTextAreaElement: any;
declare const HTMLSelectElement: any;
type DomElement = any;

function recorderScriptSource() {
  function cssEscape(value: string): string {
    return typeof window.CSS?.escape === 'function' ? window.CSS.escape(value) : value;
  }

  function shortCssPath(el: DomElement): string {
    if (el.id) return `#${cssEscape(el.id)}`;
    return cssPath(el, 2);
  }

  function fullCssPath(el: DomElement): string {
    return cssPath(el, 6);
  }

  // Two different depths so the two CSS candidates stay distinct even when `el` has no id —
  // codegen.ts still pads with a synthetic fallback in the rare case they end up identical
  // (very shallow DOM), but this keeps that a last resort rather than the common case.
  function cssPath(el: DomElement, maxDepth: number): string {
    const parts: string[] = [];
    let node: DomElement = el;
    while (node && node.nodeType === 1 && parts.length < maxDepth) {
      let selector = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c: DomElement) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(selector);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function accessibleName(el: DomElement): string {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function roleFor(el: DomElement): string | null {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'submit' || type === 'button') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return null;
  }

  function candidatesFor(el: DomElement): unknown[] {
    const candidates: unknown[] = [];
    const seen = new Set<string>();
    const add = (candidate: unknown) => {
      const key = JSON.stringify(candidate);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    };

    // Ordered so a `css` candidate always survives the length cap below, no matter how many of
    // the more-specific strategies also apply to this element.
    const testId = el.getAttribute('data-testid');
    if (testId) add({ strategy: 'testId', value: testId });

    const role = roleFor(el);
    const name = accessibleName(el);
    if (role && name) add({ strategy: 'role', role, name });
    else if (role) add({ strategy: 'role', role });

    add({ strategy: 'css', value: shortCssPath(el) });

    const placeholder = el.getAttribute('placeholder');
    if (placeholder) add({ strategy: 'placeholder', value: placeholder });
    if (name) add({ strategy: 'text', value: name });

    add({ strategy: 'css', value: fullCssPath(el) });

    return candidates.slice(0, 4);
  }

  function report(type: string, el: DomElement, value?: string) {
    if (typeof window.__recordAction__ !== 'function') return;
    window.__recordAction__({
      type,
      url: location.href,
      candidates: candidatesFor(el),
      value,
    });
  }

  document.addEventListener(
    'click',
    (e: any) => {
      if (e.target instanceof Element) report('click', e.target);
    },
    true
  );

  document.addEventListener(
    'change',
    (e: any) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        report('fill', el, el.value);
      } else if (el instanceof HTMLSelectElement) {
        report('selectOption', el, el.value);
      }
    },
    true
  );
}

function getRecorderScriptSource(): string {
  return `(${recorderScriptSource.toString()})();`;
}

module.exports = { getRecorderScriptSource };
