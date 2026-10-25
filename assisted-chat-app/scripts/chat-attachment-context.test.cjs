const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');
function fixture() {
  const state = { revision: 1, baseUrl: 'https://example.invalid', token: 'isolated-session', requests: [] };
  class FormData { constructor() { this.parts = []; } append(...part) { this.parts.push(part); } }
  const attachments = loadSource('lib/chat-attachments.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    './api': {
      ApiError: class ApiError extends Error {},
      getApiBaseUrl: () => state.baseUrl,
      getAdminToken: () => state.token,
      getApiContextRevision: () => state.revision,
    },
  }, {
    FormData,
    fetch: async (url, options) => {
      state.requests.push({ url, options });
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ url: 'https://example.invalid/voice.m4a', mimeType: 'audio/mp4', fileSize: 500 }) };
    },
  });
  return { state, attachments };
}
test('voice upload uses captured project URL/token and correct native AAC MIME/filename', async () => {
  const h = fixture(); const result = await h.attachments.uploadChatVoiceAttachment('file:///isolated.m4a');
  assert.equal(result.mimeType, 'audio/mp4'); assert.equal(h.state.requests.length, 1);
  const request = h.state.requests[0]; assert.equal(request.url, 'https://example.invalid/api/chat/upload'); assert.equal(request.options.headers.Authorization, 'Bearer isolated-session');
  assert.equal(request.options.body.parts[0][1].type, 'audio/mp4'); assert.match(request.options.body.parts[0][1].name, /^voice-\d+\.m4a$/);
});
for (const context of ['project', 'logout', 'server URL']) {
  test(`a ${context} change during attachment preparation prevents any upload`, async () => {
    const h = fixture(); const pending = h.attachments.uploadChatVoiceAttachment('file:///isolated.m4a');
    if (context === 'project') h.state.revision += 1;
    if (context === 'logout') h.state.token = null;
    if (context === 'server URL') h.state.baseUrl = 'https://another.example.invalid';
    await assert.rejects(pending, /account or project changed/); assert.equal(h.state.requests.length, 0);
  });
}
