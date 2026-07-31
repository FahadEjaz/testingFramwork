// Defense-in-depth redaction for text on its way into the AI healing escalation prompt
// (REQUIREMENTS.md 4: "no secrets/credentials/PII are ever sent to the AI model"). The DOM
// extractor (scripts/lib/dom-context.js) already limits *what* gets captured (a fixed attribute
// allow-list, no `value` attribute, short text snippets) — this is a second pass over whatever
// text does make it through, since a locator's own accessible name/text can legitimately be page
// content a real user typed or is shown (e.g. "Welcome, jane@example.com"). Not a guarantee this
// catches everything a page could display; it's a best-effort filter for the common, recognizable
// shapes, applied at every point text is about to leave this process for the model.
const PATTERNS = [
  // Email addresses.
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED-EMAIL]'],
  // JWTs — three base64url segments separated by dots.
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED-TOKEN]'],
  // "Bearer <token>" shapes.
  [/\bBearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer [REDACTED-TOKEN]'],
  // Long opaque alphanumeric strings with at least one digit (session ids, API keys, CSRF
  // tokens in query params) — 24+ chars so ordinary words/short identifiers survive untouched.
  [/\b(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{24,}\b/g, '[REDACTED-TOKEN]'],
  // Credit-card-shaped digit runs (13-19 digits, optionally grouped by spaces/dashes).
  [/\b(?:\d[ -]?){13,19}\b/g, '[REDACTED-NUMBER]'],
];

function redactSecrets(text) {
  return PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

module.exports = { redactSecrets };
