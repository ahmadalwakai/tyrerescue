/* global __dirname, Buffer */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, 'prepare-codemagic-ios.cjs'), 'utf8');

function release(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tyre-release-source-'));
  const files = {
    'app.json': JSON.stringify({ expo: { version: '1.0.7', ios: { buildNumber: '22', bundleIdentifier: 'uk.tyrerescue.customer' },
      extra: { eas: { projectId: 'c97a7bac-50da-42d8-9aef-3071d6b00925' } }, newArchEnabled: true } }),
    'package.json': JSON.stringify({ version: '1.0.7', main: 'expo-router/entry', scripts: {}, engines: { node: '24.x' } }),
    'package-lock.json': '{}',
    'modules/customer-live-activity/ios/CustomerLiveActivityModule.swift': 'import ExpoModulesCore',
    'modules/customer-live-activity/ios/CustomerRescueAttributes.swift': 'import ActivityKit',
    'modules/customer-live-activity/ios/CustomerLiveActivity.podspec': 'Pod::Spec.new do |s|; end',
    'modules/customer-tyre-scanner/ios/CustomerTyreScannerModule.swift': 'import ExpoModulesCore',
    'modules/customer-tyre-scanner/ios/CustomerTyreScanner.podspec': 'Pod::Spec.new do |s|; end',
    'modules/customer-tyre-scanner/android/build.gradle': "plugins { id 'com.android.library' }",
    'modules/customer-tyre-scanner/android/src/main/AndroidManifest.xml': '<manifest />',
    'modules/customer-tyre-scanner/android/src/main/java/uk/tyrerescue/customertyrescanner/CustomerTyreScannerModule.kt': 'package uk.tyrerescue.customertyrescanner',
    ...Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`src/file-${index}.ts`, 'export {};'])),
    ...extra,
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, 'tyre-rescue', file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, contents);
  }
  const env = { CM_BUILD_DIR: root, CUSTOMER_APP_DIR: 'tyre-rescue', CUSTOMER_CI_DIR: 'ci/customer-ios22-codemagic',
    EXPO_PUBLIC_API_BASE_URL: 'https://www.tyrerescue.uk', EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.synthetic', EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_synthetic' };
  const git = (_, args) => args[0] === 'ls-files' ? Buffer.from(Object.keys(files).map(file => `tyre-rescue/${file}`).join('\0') + '\0')
    : Buffer.from(files[args[1].replace(':tyre-rescue/', '')]);
  const run = freeze => vm.runInNewContext(source, {
    require: name => name === 'node:child_process' ? { execFileSync: git } : require(name),
    process: { env, argv: freeze ? ['node', 'prepare', '--freeze', 'ci/customer-ios22-codemagic/source-manifest.json'] : ['node', 'prepare'] },
    console: { log() {} }, __dirname,
  }, { filename: 'prepare-codemagic-ios.cjs' });
  return { run, root, manifest: () => JSON.parse(fs.readFileSync(path.join(root, 'ci/customer-ios22-codemagic/source-manifest.json'), 'utf8')) };
}

test('release freeze and verification include the exact local ActivityKit sources', () => {
  const h = release(); h.run(true); h.run(false);
  const native = h.manifest().files.filter(file => file.file.startsWith('modules/customer-live-activity/ios/'));
  assert.equal(native.length, 3); assert.ok(native.every(file => file.bytes > 0 && file.sha256.length === 64));
});

test('release freeze and verification include all handwritten tyre scanner native sources', () => {
  const h = release(); h.run(true); h.run(false);
  const native = h.manifest().files.filter(file => file.file.startsWith('modules/customer-tyre-scanner/'));
  assert.equal(native.length, 5); assert.ok(native.every(file => file.bytes > 0 && file.sha256.length === 64));
});

for (const file of ['ios/Generated.swift', 'android/MainActivity.kt', 'modules/other/ios/Native.swift',
  'modules/customer-live-activity/ios/.env', 'modules/customer-live-activity/ios/key.p8',
  'modules/customer-live-activity/ios/profile.mobileprovision', 'modules/customer-live-activity/ios/Generated.swift',
  'modules/customer-tyre-scanner/ios/Generated.swift', 'modules/customer-tyre-scanner/ios/key.p8',
  'modules/customer-tyre-scanner/android/.env', 'modules/customer-tyre-scanner/android/build/output.apk',
  'modules/customer-tyre-scanner/android/src/main/java/uk/tyrerescue/customertyrescanner/Other.kt',
  'modules/customer-tyre-scanner/android/src/main/java/uk/tyrerescue/other/Other.kt']) {
  test(`release freeze still refuses private or unreviewed native file ${file}`, () => {
    const h = release({ [file]: 'synthetic' }); assert.throws(() => h.run(true), /Private or generated artifact/);
  });
}

test('allowed native source still undergoes secret scanning and frozen-content verification', () => {
  const invalid = release({ 'modules/customer-live-activity/ios/CustomerLiveActivityModule.swift': 'sk_live_' + 'a'.repeat(20) });
  assert.throws(() => invalid.run(true), /Private literal/);
  const h = release(); h.run(true);
  fs.appendFileSync(path.join(h.root, 'tyre-rescue/modules/customer-live-activity/ios/CustomerRescueAttributes.swift'), '\nchanged');
  assert.throws(() => h.run(false), /Frozen source mismatch/);
});

test('scanner sources remain subject to secret and frozen-content verification', () => {
  const file = 'modules/customer-tyre-scanner/ios/CustomerTyreScannerModule.swift';
  const invalid = release({ [file]: 'sk_live_' + 'a'.repeat(20) });
  assert.throws(() => invalid.run(true), /Private literal/);
  const h = release(); h.run(true);
  fs.appendFileSync(path.join(h.root, 'tyre-rescue', file), '\nchanged');
  assert.throws(() => h.run(false), /Frozen source mismatch/);
});
