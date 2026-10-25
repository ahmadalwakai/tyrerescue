import { describe, it, expect, afterEach, vi } from 'vitest';
import twilio from 'twilio';
import { isValidTwilioRequest } from '@/lib/ai-receptionist/twilio-signature';

const TOKEN = 'twilio-auth-token';
const BASE = 'https://www.tyrerescue.uk';
const body = 'CallSid=CA123&SpeechResult=flat+tyre';
const bodyParams = Object.fromEntries(new URLSearchParams(body));

function signedRequest(pathAndQuery: string, signedUrl = BASE + pathAndQuery) {
  const signature = twilio.getExpectedTwilioSignature(TOKEN, signedUrl, bodyParams);
  return new Request(`http://internal.host${pathAndQuery}`, {
    method: 'POST',
    headers: { 'x-twilio-signature': signature },
    body,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('isValidTwilioRequest (production)', () => {
  function production(token = TOKEN) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TWILIO_AUTH_TOKEN', token);
    vi.stubEnv('TWILIO_WEBHOOK_URL', BASE);
  }

  it('accepts a gather callback signed over its query string', async () => {
    production();
    const path = '/api/twilio/voice/gather?step=2&callSid=CA123';
    await expect(isValidTwilioRequest(signedRequest(path), body)).resolves.toBe(true);
  });

  it('rejects a callback whose step was changed after signing', async () => {
    production();
    const req = signedRequest('/api/twilio/voice/gather?step=4&callSid=CA123', `${BASE}/api/twilio/voice/gather?step=2&callSid=CA123`);
    await expect(isValidTwilioRequest(req, body)).resolves.toBe(false);
  });

  it('rejects an unsigned request', async () => {
    production();
    const req = new Request(`${BASE}/api/twilio/voice/gather?step=0`, { method: 'POST', body });
    await expect(isValidTwilioRequest(req, body)).resolves.toBe(false);
  });

  it('rejects everything when the auth token is missing', async () => {
    production('');
    await expect(isValidTwilioRequest(signedRequest('/api/twilio/voice'), body)).resolves.toBe(false);
  });
});
