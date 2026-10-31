/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const xcode = require('xcode');
const { configureProject, declareExtension, TARGET } = require('../plugins/with-customer-live-activity.cjs');

function sampleProject(file) {
  const project = xcode.project(file);
  const ids = { project: 'A00000000000000000000001', app: 'A00000000000000000000002', group: 'A00000000000000000000003',
    products: 'A00000000000000000000004', configs: 'A00000000000000000000005', debug: 'A00000000000000000000006', release: 'A00000000000000000000007' };
  project.hash = { headComment: '!$*UTF8*$!', project: { archiveVersion: 1, classes: {}, objectVersion: 54, rootObject: ids.project,
    objects: {
      PBXProject: { [ids.project]: { isa: 'PBXProject', attributes: {}, mainGroup: ids.group, productRefGroup: ids.products, targets: [{ value: ids.app, comment: 'CustomerApp' }] } },
      PBXNativeTarget: { [ids.app]: { isa: 'PBXNativeTarget', name: 'CustomerApp', productType: '"com.apple.product-type.application"', buildPhases: [], buildRules: [], dependencies: [], buildConfigurationList: ids.configs } },
      PBXGroup: { [ids.group]: { isa: 'PBXGroup', children: [{ value: ids.products, comment: 'Products' }], sourceTree: '"<group>"' },
        [ids.products]: { isa: 'PBXGroup', name: 'Products', children: [], sourceTree: '"<group>"' } },
      PBXBuildFile: {}, PBXFileReference: {}, PBXSourcesBuildPhase: {}, PBXFrameworksBuildPhase: {}, PBXResourcesBuildPhase: {},
      XCBuildConfiguration: {
        [ids.debug]: { isa: 'XCBuildConfiguration', name: 'Debug', buildSettings: { DEVELOPMENT_TEAM: 'TESTTEAM', MARKETING_VERSION: '1.0', CURRENT_PROJECT_VERSION: '1', UNRELATED_SETTING: 'keep' } },
        [ids.release]: { isa: 'XCBuildConfiguration', name: 'Release', buildSettings: { DEVELOPMENT_TEAM: 'TESTTEAM', MARKETING_VERSION: '1.0', CURRENT_PROJECT_VERSION: '1', UNRELATED_SETTING: 'keep' } },
      },
      XCConfigurationList: { [ids.configs]: { isa: 'XCConfigurationList', buildConfigurations: [{ value: ids.debug, comment: 'Debug' }, { value: ids.release, comment: 'Release' }], defaultConfigurationName: 'Release' } },
    } } };
  fs.writeFileSync(file, project.writeSync());
  const parsed = xcode.project(file); parsed.parseSync(); return parsed;
}

const actualEntries = section => Object.entries(section).filter(([key]) => !key.endsWith('_comment'));

test('native prebuild adds one compiled and embedded widget, preserving app settings on repeated prebuilds', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tyre-live-activity-'));
  const file = path.join(directory, 'project.pbxproj');
  const config = { ios: { bundleIdentifier: 'uk.tyrerescue.customer', buildNumber: '20' }, version: '1.0.5',
    extra: { eas: { projectId: 'existing', build: { experimental: { ios: { appExtensions: [{ targetName: 'OtherExtension', bundleIdentifier: 'uk.tyrerescue.other' }] } } } } } };
  const project = sampleProject(file);
  configureProject(project, directory, config);
  const first = project.writeSync();
  configureProject(project, directory, config);
  assert.equal(project.writeSync(), first, 'a repeated prebuild must not create target, source or embed duplicates');
  fs.writeFileSync(file, first);
  const parsed = xcode.project(file); parsed.parseSync();
  const objects = parsed.hash.project.objects;
  const [targetId, target] = actualEntries(objects.PBXNativeTarget).find(([, item]) => item.name.replaceAll('"', '') === TARGET);
  const sourcePhase = target.buildPhases.map(item => objects.PBXSourcesBuildPhase[item.value]).find(Boolean);
  assert.equal(sourcePhase.files.length, 2);
  const sourceNames = sourcePhase.files.map(item => objects.PBXFileReference[objects.PBXBuildFile[item.value].fileRef].path.replaceAll('"', '')).sort();
  assert.deepEqual(sourceNames, ['CustomerRescueAttributes.swift', 'CustomerRescueWidget.swift']);
  const main = parsed.getFirstTarget().firstTarget;
  const copyPhase = main.buildPhases.map(item => objects.PBXCopyFilesBuildPhase[item.value]).find(Boolean);
  assert.equal(String(copyPhase.dstSubfolderSpec), '13');
  assert.equal(copyPhase.files.length, 1);
  assert.equal(objects.PBXBuildFile[copyPhase.files[0].value].fileRef, target.productReference);
  assert.equal(main.dependencies.length, 1);
  assert.equal(objects.PBXTargetDependency[main.dependencies[0].value].target, targetId);
  for (const item of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
    const settings = objects.XCBuildConfiguration[item.value].buildSettings;
    assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, '"uk.tyrerescue.customer.liveactivity"');
    assert.equal(String(settings.IPHONEOS_DEPLOYMENT_TARGET), '16.2');
    assert.equal(settings.DEVELOPMENT_TEAM, 'TESTTEAM');
    assert.equal(String(settings.CURRENT_PROJECT_VERSION), '20');
    assert.equal(settings.MARKETING_VERSION, '1.0.5');
    assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
  }
  for (const item of objects.XCConfigurationList[main.buildConfigurationList].buildConfigurations) {
    const build = objects.XCBuildConfiguration[item.value];
    assert.equal(build.buildSettings.UNRELATED_SETTING, 'keep');
    assert.equal(build.buildSettings.CUSTOMER_LIVE_ACTIVITY_PUSH_ENVIRONMENT, build.name === 'Debug' ? 'sandbox' : 'production');
  }
  assert.equal(config.extra.eas.projectId, 'existing');
  assert.deepEqual(config.extra.eas.build.experimental.ios.appExtensions.map(item => item.targetName), ['OtherExtension', TARGET]);
  assert.equal(fs.readFileSync(path.join(directory, TARGET, 'CustomerRescueAttributes.swift'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../modules/customer-live-activity/ios/CustomerRescueAttributes.swift'), 'utf8'));
  assert.match(fs.readFileSync(path.join(directory, TARGET, `${TARGET}-Info.plist`), 'utf8'), /com.apple.widgetkit-extension/);
});

test('extension credential declaration updates its own identifier without removing other targets', () => {
  const config = { ios: { bundleIdentifier: 'uk.tyrerescue.preview' }, extra: { eas: { projectId: 'keep' } } };
  declareExtension(config); declareExtension(config);
  assert.deepEqual(config.extra.eas.build.experimental.ios.appExtensions, [{ targetName: TARGET, bundleIdentifier: 'uk.tyrerescue.preview.liveactivity', entitlements: {} }]);
});

function bridge(platform, native) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../modules/customer-live-activity/index.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} }; let loads = 0;
  const dependencies = { 'react-native': { Platform: { OS: platform } }, 'expo-modules-core': { requireOptionalNativeModule: () => { loads++; return native; } } };
  vm.runInNewContext(`(function(require,module,exports){${source}})`, { Promise })(name => dependencies[name], module, module.exports);
  return { api: module.exports.default, loads: () => loads };
}

for (const platform of ['web', 'android', 'ios']) {
  test(`missing ActivityKit support on ${platform} never blocks the booking UI`, async () => {
    const { api, loads } = bridge(platform, null);
    assert.equal(await api.isSupported(), false);
    assert.equal((await api.getActivities()).length, 0);
    await api.startOrUpdate('REF-123', {}); await api.end('REF-123'); await api.endAll();
    api.addPushTokenListener(() => assert.fail('unsupported listener fired')).remove();
    assert.equal(loads(), platform === 'ios' ? 1 : 0);
  });
}

test('iOS forwards state, token rotation events and optional final content without embedding credentials', async () => {
  const calls = []; let receive; let removed = false;
  const native = {
    isSupported: async () => true, getActivities: async () => [{ refNumber: 'REF-123', activityId: 'activity', pushToken: null, environment: 'production' }],
    startOrUpdate: async (...args) => calls.push(['update', ...args]), end: async (...args) => calls.push(['end', ...args]), endAll: async () => calls.push(['endAll']),
    addListener: (name, listener) => { assert.equal(name, 'onPushToken'); receive = listener; return { remove: () => { removed = true; } }; },
  };
  const { api } = bridge('ios', native);
  assert.equal(await api.isSupported(), true); assert.equal((await api.getActivities())[0].refNumber, 'REF-123');
  const state = { status: 'en_route', driverName: 'Alex', estimatedArrivalAt: 1000, updatedAt: 500, staleAt: 680 };
  await api.startOrUpdate('REF-123', state); await api.end('REF-123'); await api.endAll();
  assert.deepEqual(calls, [['update', 'REF-123', state], ['end', 'REF-123', null], ['endAll']]);
  let token; const subscription = api.addPushTokenListener(event => { token = event.pushToken; });
  receive({ refNumber: 'REF-123', activityId: 'activity', pushToken: 'rotated', environment: 'production' });
  assert.equal(token, 'rotated'); subscription.remove(); assert.equal(removed, true);
});
