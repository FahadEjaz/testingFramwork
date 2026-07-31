// Unit tests for RecordingSession.dispatchMouseEvent's CDP command shaping — no real browser
// needed, just a fake `cdp.send` capturing what would have been sent. Covers the scroll fix:
// recording had no way to scroll the remote page (no wheel handling anywhere in the input path).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RecordingSession } = require('../src/recording/session.ts');

function sessionWithFakeCdp() {
  const calls: any[] = [];
  const session: any = new RecordingSession('test-session', 'http://example.com', 0);
  session.cdp = { send: async (method: string, params: any) => calls.push({ method, params }) };
  return { session, calls };
}

test('dispatchMouseEvent sends deltaX/deltaY (no button/clickCount) for mouseWheel', async () => {
  const { session, calls } = sessionWithFakeCdp();
  await session.dispatchMouseEvent({ type: 'mouseWheel', x: 100, y: 200, deltaX: 0, deltaY: 40 });
  assert.deepEqual(calls, [
    { method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 100, y: 200, deltaX: 0, deltaY: 40 } },
  ]);
});

test('dispatchMouseEvent defaults missing deltaX/deltaY to 0 for mouseWheel', async () => {
  const { session, calls } = sessionWithFakeCdp();
  await session.dispatchMouseEvent({ type: 'mouseWheel', x: 5, y: 5 });
  assert.deepEqual(calls[0].params, { type: 'mouseWheel', x: 5, y: 5, deltaX: 0, deltaY: 0 });
});

test('dispatchMouseEvent still sends button/clickCount for click events, unaffected by the wheel change', async () => {
  const { session, calls } = sessionWithFakeCdp();
  await session.dispatchMouseEvent({ type: 'mousePressed', x: 1, y: 2 });
  assert.deepEqual(calls[0].params, { type: 'mousePressed', x: 1, y: 2, button: 'left', clickCount: 1 });
});
