// Unit tests for the Phase 11 hardening pass: scripts/lib/redact.js, the defense-in-depth filter
// applied to everything sent to the AI healing model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { redactSecrets } = require('../../scripts/lib/redact');

test('redacts an email address', () => {
  assert.equal(redactSecrets('Welcome, jane.doe@example.com!'), 'Welcome, [REDACTED-EMAIL]!');
});

test('redacts a JWT-shaped token', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  assert.equal(redactSecrets(`token=${jwt}`), 'token=[REDACTED-TOKEN]');
});

test('redacts a Bearer authorization value', () => {
  assert.equal(redactSecrets('Authorization: Bearer abc123def456ghi789'), 'Authorization: Bearer [REDACTED-TOKEN]');
});

test('redacts a long opaque alphanumeric token in a URL', () => {
  assert.equal(
    redactSecrets('href=/reset-password?token=a1b2c3d4e5f6g7h8i9j0k1l2m3'),
    'href=/reset-password?token=[REDACTED-TOKEN]'
  );
});

test('redacts a credit-card-shaped digit run', () => {
  assert.equal(redactSecrets('Card ending 4111 1111 1111 1111'), 'Card ending [REDACTED-NUMBER]');
});

test('leaves ordinary short identifiers and words untouched', () => {
  const text = 'button role=\"link\" name=\"Get started\" class=\"btn-primary\" id=\"go-btn\"';
  assert.equal(redactSecrets(text), text);
});

test('leaves a short realistic data-testid untouched', () => {
  assert.equal(redactSecrets('data-testid=confirm-btn'), 'data-testid=confirm-btn');
});
