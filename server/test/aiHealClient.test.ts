// Unit tests for the Phase 9 AI escalation client (scripts/lib/ai-heal-client.js). Uses an
// injected fake Anthropic client (same injectable-dependency pattern as createApp's runSpec/
// sessionManager overrides) so these never make a real network call.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestHealedLocator, parseLocatorEntry } = require('../../scripts/lib/ai-heal-client');

function fakeClient(responseText: string, usage = { input_tokens: 100, output_tokens: 20 }) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }],
        usage,
      }),
    },
  };
}

// Captures the exact prompt text sent to the model, so the Phase 11 redaction pass can be
// asserted against what actually leaves the process rather than just scripts/lib/redact.js in
// isolation.
function capturingClient(responseText: string) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      messages: {
        create: async (args: any) => {
          calls.push(args);
          return { content: [{ type: 'text', text: responseText }], usage: { input_tokens: 1, output_tokens: 1 } };
        },
      },
    },
  };
}

test('requestHealedLocator parses a role locator response and reports token usage', async () => {
  const { entry, usage } = await requestHealedLocator(
    { elementKey: 'submit', oldPrimary: { strategy: 'css', value: '.old' }, domContext: '[]' },
    { client: fakeClient('{"strategy":"role","role":"button","name":"Submit"}') }
  );
  assert.deepEqual(entry, { strategy: 'role', role: 'button', name: 'Submit' });
  assert.deepEqual(usage, { inputTokens: 100, outputTokens: 20 });
});

test('requestHealedLocator parses a value-based locator response', async () => {
  const { entry } = await requestHealedLocator(
    { elementKey: 'cancel', oldPrimary: { strategy: 'css', value: '.old-cancel' }, domContext: '[]' },
    { client: fakeClient('{"strategy":"text","value":"Cancel"}') }
  );
  assert.deepEqual(entry, { strategy: 'text', value: 'Cancel' });
});

test('requestHealedLocator strips surrounding whitespace before parsing', async () => {
  const { entry } = await requestHealedLocator(
    { elementKey: 'submit', oldPrimary: {}, domContext: '[]' },
    { client: fakeClient('\n  {"strategy":"testId","value":"go-btn"}  \n') }
  );
  assert.deepEqual(entry, { strategy: 'testId', value: 'go-btn' });
});

test('requestHealedLocator rejects a non-JSON response', async () => {
  await assert.rejects(
    requestHealedLocator(
      { elementKey: 'submit', oldPrimary: {}, domContext: '[]' },
      { client: fakeClient('sure, try page.locator(".submit")') }
    ),
    /not valid JSON/
  );
});

test('requestHealedLocator rejects an unrecognized strategy', async () => {
  await assert.rejects(
    requestHealedLocator(
      { elementKey: 'submit', oldPrimary: {}, domContext: '[]' },
      { client: fakeClient('{"strategy":"xpath","value":"//button"}') }
    ),
    /not a recognized locator shape/
  );
});

test('requestHealedLocator rejects a role locator missing "role"', async () => {
  await assert.rejects(
    requestHealedLocator(
      { elementKey: 'submit', oldPrimary: {}, domContext: '[]' },
      { client: fakeClient('{"strategy":"role","name":"Submit"}') }
    ),
    /missing "role"/
  );
});

test('requestHealedLocator throws when no API key and no injected client are available', async () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      requestHealedLocator({ elementKey: 'submit', oldPrimary: {}, domContext: '[]' }),
      /ANTHROPIC_API_KEY is not set/
    );
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
  }
});

test('requestHealedLocator redacts an email in oldPrimary before it reaches the model', async () => {
  const { calls, client } = capturingClient('{"strategy":"text","value":"Cancel"}');
  await requestHealedLocator(
    {
      elementKey: 'welcomeBanner',
      oldPrimary: { strategy: 'text', value: 'Welcome, jane.doe@example.com' },
      domContext: '[]',
    },
    { client }
  );
  const sentText = calls[0].messages[0].content;
  assert.doesNotMatch(sentText, /jane\.doe@example\.com/);
  assert.match(sentText, /\[REDACTED-EMAIL\]/);
});

test('requestHealedLocator redacts a long token already present in domContext (defense in depth)', async () => {
  const { calls, client } = capturingClient('{"strategy":"text","value":"Cancel"}');
  await requestHealedLocator(
    {
      elementKey: 'submit',
      oldPrimary: {},
      domContext: '[{"tag":"a","attrs":{"href":"/reset?token=a1b2c3d4e5f6g7h8i9j0k1l2m3"},"text":""}]',
    },
    { client }
  );
  const sentText = calls[0].messages[0].content;
  assert.doesNotMatch(sentText, /a1b2c3d4e5f6g7h8i9j0k1l2m3/);
});

test('parseLocatorEntry is exported directly for validation-only checks', () => {
  assert.deepEqual(parseLocatorEntry('{"strategy":"css","value":".btn"}'), { strategy: 'css', value: '.btn' });
});
