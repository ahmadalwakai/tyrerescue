const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

function harness(response) {
  const requests = [];
  const api = loadSource('../../tyre-rescue/src/api.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    './config': { API_BASE_URL: 'https://example.invalid' },
  }, {
    Error, SyntaxError, AbortController, setTimeout, clearTimeout,
    fetch: async (url, init) => { requests.push({ url, init }); return response; },
  });
  return { ...api, requests };
}

const limitedResponse = retryAfter => Response.json({ error: 'Too many attempts.' }, {
  status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter },
});

test('API failures preserve the server retry interval without retrying the request', async () => {
  for (const [header, expected] of [['37', 37], ['3600', 3600], [' 120 ', 120], ['0', 0]]) {
    const h = harness(limitedResponse(header));
    await assert.rejects(h.requestJson('/resend', { method: 'POST', body: '{}' }), error => {
      assert.ok(error instanceof h.CustomerApiError);
      assert.equal(error.message, 'Too many attempts.'); assert.equal(error.kind, 'http');
      assert.equal(error.status, 429); assert.equal(error.retryAfterSeconds, expected); return true;
    });
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].init.credentials, 'omit');
  }
});

test('missing, malformed or overflowing retry intervals remain ordinary HTTP errors', async () => {
  for (const header of [null, '', '-1', '1.5', 'NaN', 'Infinity', '1e3', '60 seconds', '9007199254740991', '9'.repeat(400)]) {
    const h = harness(limitedResponse(header));
    await assert.rejects(h.requestJson('/resend'), error => {
      assert.ok(error instanceof h.CustomerApiError);
      assert.equal(error.status, 429); assert.equal(error.retryAfterSeconds, null); return true;
    });
    assert.equal(h.requests.length, 1);
  }
});

test('existing API error constructors retain their status and connection classification', () => {
  const h = harness();
  const timeout = new h.CustomerApiError('Timed out.', 'timeout');
  assert.equal(timeout.status, null); assert.equal(timeout.retryAfterSeconds, null);
  assert.equal(h.isCustomerConnectionError(timeout), true);
  const unauthorized = new h.CustomerApiError('Unauthorized', 'http', 401);
  assert.equal(unauthorized.status, 401); assert.equal(unauthorized.retryAfterSeconds, null);
  assert.equal(h.isCustomerConnectionError(unauthorized), false);
  assert.equal(new h.CustomerApiError('Cancelled', 'aborted').name, 'AbortError');
});
