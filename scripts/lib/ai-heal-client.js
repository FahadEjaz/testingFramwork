// Single scoped AI call for the failure path only (Phase 9 — REQUIREMENTS.md 3.3 step 4). Never
// called on a passing run, never called until every deterministic fallback in the manifest has
// already failed. Gets only the failed locator's old definition + a pruned DOM snippet
// (scripts/lib/dom-context.js) — never the full page, never secrets/credentials/PII.
const VALID_STRATEGIES = ['role', 'testId', 'css', 'text', 'label', 'placeholder'];
const DEFAULT_MODEL = process.env.AI_HEAL_MODEL || 'claude-haiku-4-5-20251001';

// deps.client lets tests inject a fake Anthropic client instead of hitting the real API — same
// injectable-dependency pattern as server/src/app.ts's runSpec/sessionManager overrides.
async function requestHealedLocator({ elementKey, oldPrimary, domContext }, deps = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = deps.client ?? createDefaultClient(apiKey);

  const prompt =
    `A Playwright locator broke for element "${elementKey}". Its previous (now-failing) ` +
    `definition was:\n${JSON.stringify(oldPrimary)}\n\n` +
    'Here is a pruned snapshot of the current page\'s interactive elements — a JSON array of ' +
    `{tag, attrs, text} objects, not the full page:\n${domContext}\n\n` +
    'Return ONLY a single JSON object describing one updated locator for the same element, no ' +
    'prose, no markdown fences. Shape must be exactly one of:\n' +
    '{"strategy":"role","role":"<aria role>","name":"<accessible name>"}\n' +
    '{"strategy":"testId"|"css"|"text"|"label"|"placeholder","value":"<locator value>"}';

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return {
    entry: parseLocatorEntry(text),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}

function createDefaultClient(apiKey) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — AI healing escalation unavailable');
  // Lazy require so the SDK is only loaded on this failure path, never on a normal passing run.
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey });
}

function parseLocatorEntry(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`AI response was not valid JSON: ${text.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== 'object' || !VALID_STRATEGIES.includes(parsed.strategy)) {
    throw new Error(`AI response was not a recognized locator shape: ${text.slice(0, 200)}`);
  }
  if (parsed.strategy === 'role') {
    if (typeof parsed.role !== 'string') throw new Error('AI "role" locator response is missing "role"');
    return parsed.name ? { strategy: 'role', role: parsed.role, name: parsed.name } : { strategy: 'role', role: parsed.role };
  }
  if (typeof parsed.value !== 'string') throw new Error(`AI "${parsed.strategy}" locator response is missing "value"`);
  return { strategy: parsed.strategy, value: parsed.value };
}

module.exports = { requestHealedLocator, parseLocatorEntry };
