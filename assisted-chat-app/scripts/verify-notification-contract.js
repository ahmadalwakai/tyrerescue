/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const contractPath = path.join(projectRoot, 'src', 'lib', 'notification-contract.ts');
const notificationsPath = path.join(projectRoot, 'src', 'lib', 'notifications.ts');
const patchPath = path.join(projectRoot, 'patches', 'expo-notifications+55.0.25.patch');
const easConfigPath = path.join(projectRoot, 'eas.json');

function loadContract() {
  const source = fs.readFileSync(contractPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output, sandbox, { filename: contractPath });
  return sandbox.module.exports;
}

const {
  isServerRegistrationEnabled,
  parsePersistedRegistrationInfo,
} = loadContract();

assert.equal(parsePersistedRegistrationInfo('{"isEnabled":true}').isEnabled, true);
assert.equal(isServerRegistrationEnabled('{"isEnabled":true}'), true);

for (const value of [null, undefined, '', 'null', '[]', '{}', '{"isEnabled":false}']) {
  assert.equal(isServerRegistrationEnabled(value), false);
}

for (const value of [
  '{',
  '{"isEnabled":',
  123,
  true,
  { isEnabled: true },
  '{"lastRegisteredDeviceToken":{"deviceToken":"stale"}}',
]) {
  assert.equal(parsePersistedRegistrationInfo(value)?.isEnabled === true, false);
}

assert.equal(isServerRegistrationEnabled('{'), false);
assert.equal(isServerRegistrationEnabled('{"isEnabled":true}'), true);

const notificationsSource = fs.readFileSync(notificationsPath, 'utf8');
assert.match(
  notificationsSource,
  /import type \* as ExpoNotifications from 'expo-notifications'/,
);
assert.doesNotMatch(
  notificationsSource,
  /import \* as Notifications from 'expo-notifications'/,
);
assert.match(notificationsSource, /import\('expo-notifications'\)/);
assert.doesNotMatch(notificationsSource, /DISABLE_SERVER_REGISTRATION_STARTUP/);

const nativePatch = fs.readFileSync(patchPath, 'utf8');
assert.doesNotMatch(nativePatch, /setRegistrationInfoAsync/);
assert.match(nativePatch, /shouldThrowOnKeychainFailure: false/);
assert.match(nativePatch, /if !shouldThrowOnKeychainFailure/);

const easConfig = fs.readFileSync(easConfigPath, 'utf8');
assert.doesNotMatch(easConfig, /EXPO_PUBLIC_DISABLE_SERVER_REGISTRATION_STARTUP/);

console.log('notification contract checks passed');
