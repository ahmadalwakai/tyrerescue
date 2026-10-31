/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const TARGET = 'CustomerRescueLiveActivity';
const unquote = value => String(value ?? '').replace(/^"|"$/g, '');

function declareExtension(config) {
  const bundleIdentifier = `${config.ios?.bundleIdentifier || 'uk.tyrerescue.customer'}.liveactivity`;
  const eas = config.extra?.eas || {};
  const build = eas.build || {};
  const experimental = build.experimental || {};
  const ios = experimental.ios || {};
  const appExtensions = (ios.appExtensions || []).filter(item => item.targetName !== TARGET);
  appExtensions.push({ targetName: TARGET, bundleIdentifier, entitlements: {} });
  config.extra = { ...config.extra, eas: { ...eas, build: { ...build, experimental: { ...experimental,
    ios: { ...ios, appExtensions },
  } } } };
  return bundleIdentifier;
}

function configureProject(project, nativeProjectRoot, config) {
  const objects = project.hash.project.objects;
  const appTarget = project.getFirstTarget();
  if (unquote(appTarget.firstTarget.productType) !== 'com.apple.product-type.application') {
    throw new Error('Customer Live Activity requires the main application to be the first Xcode target.');
  }
  const targetEntry = Object.entries(objects.PBXNativeTarget).find(([key, value]) =>
    !key.endsWith('_comment') && unquote(value.name) === TARGET);
  if (targetEntry && unquote(targetEntry[1].productType) !== 'com.apple.product-type.app-extension') {
    throw new Error(`${TARGET} already exists but is not an app extension.`);
  }
  objects.PBXTargetDependency ||= {};
  objects.PBXContainerItemProxy ||= {};
  const bundleIdentifier = declareExtension(config);
  const target = targetEntry ? { uuid: targetEntry[0], pbxNativeTarget: targetEntry[1] }
    : project.addTarget(TARGET, 'app_extension', TARGET, bundleIdentifier);

  const folder = path.join(nativeProjectRoot, TARGET);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'customer-live-activity', 'CustomerRescueWidget.swift'), path.join(folder, 'CustomerRescueWidget.swift'));
  fs.copyFileSync(path.join(__dirname, '../modules/customer-live-activity/ios/CustomerRescueAttributes.swift'), path.join(folder, 'CustomerRescueAttributes.swift'));
  fs.writeFileSync(path.join(folder, `${TARGET}-Info.plist`), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Tyre Rescue</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>XPC!</string>
  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>
`, 'utf8');

  const sourcePhase = target.pbxNativeTarget.buildPhases.find(item => objects.PBXSourcesBuildPhase?.[item.value]);
  if (!sourcePhase) project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  if (!target.pbxNativeTarget.buildPhases.some(item => objects.PBXFrameworksBuildPhase?.[item.value])) {
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
  }
  if (!target.pbxNativeTarget.buildPhases.some(item => objects.PBXResourcesBuildPhase?.[item.value])) {
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
  }
  let group = Object.entries(objects.PBXGroup).find(([key, value]) => !key.endsWith('_comment') && unquote(value.name) === TARGET);
  if (!group) {
    const created = project.addPbxGroup([], TARGET, TARGET);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    objects.PBXGroup[mainGroup].children.push({ value: created.uuid, comment: TARGET });
    group = [created.uuid, created.pbxGroup];
  }
  const phase = target.pbxNativeTarget.buildPhases.map(item => objects.PBXSourcesBuildPhase?.[item.value]).find(Boolean);
  for (const filename of ['CustomerRescueWidget.swift', 'CustomerRescueAttributes.swift']) {
    // Paths are relative to the extension group, not the application's group.
    const linked = phase.files.some(item => unquote(objects.PBXFileReference[objects.PBXBuildFile[item.value]?.fileRef]?.path) === filename);
    if (!linked) project.addSourceFile(filename, { target: target.uuid }, group[0]);
  }
  const configs = objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations;
  const appConfigs = objects.XCConfigurationList[appTarget.firstTarget.buildConfigurationList].buildConfigurations;
  const appBuilds = appConfigs.map(item => objects.XCBuildConfiguration[item.value]);
  for (const item of configs) {
    const entry = objects.XCBuildConfiguration[item.value];
    const main = appBuilds.find(value => value.name === entry.name)?.buildSettings || appBuilds[0].buildSettings;
    Object.assign(entry.buildSettings, {
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}"`,
      PRODUCT_NAME: `"${TARGET}"`,
      INFOPLIST_FILE: `"${TARGET}/${TARGET}-Info.plist"`,
      IPHONEOS_DEPLOYMENT_TARGET: '16.2',
      TARGETED_DEVICE_FAMILY: '"1,2"',
      SWIFT_VERSION: '5.0',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      SKIP_INSTALL: 'YES',
      GENERATE_INFOPLIST_FILE: 'NO',
      CODE_SIGN_STYLE: main.CODE_SIGN_STYLE || 'Automatic',
      // Expo writes versions directly into the app Info.plist; template Xcode
      // build settings may still say 1 / 1.0 and must not override app config.
      CURRENT_PROJECT_VERSION: config.ios?.buildNumber || main.CURRENT_PROJECT_VERSION || '1',
      MARKETING_VERSION: config.ios?.version || config.version || main.MARKETING_VERSION || '1.0.0',
      ...(main.DEVELOPMENT_TEAM ? { DEVELOPMENT_TEAM: main.DEVELOPMENT_TEAM } : {}),
    });
  }
  for (const entry of appBuilds) {
    entry.buildSettings.CUSTOMER_LIVE_ACTIVITY_PUSH_ENVIRONMENT ??= entry.name === 'Debug' ? 'sandbox' : 'production';
  }
  const projectObject = project.getFirstProject().firstProject;
  projectObject.attributes ||= {};
  projectObject.attributes.TargetAttributes ||= {};
  projectObject.attributes.TargetAttributes[target.uuid] ||= { CreatedOnToolsVersion: '16.0' };
  return project;
}

function withCustomerLiveActivity(config) {
  declareExtension(config);
  config = withInfoPlist(config, value => {
    value.modResults.NSSupportsLiveActivities = true;
    value.modResults.CustomerLiveActivityPushEnvironment = '$(CUSTOMER_LIVE_ACTIVITY_PUSH_ENVIRONMENT)';
    return value;
  });
  return withXcodeProject(config, value => {
    configureProject(value.modResults, value.modRequest.platformProjectRoot, value);
    return value;
  });
}

module.exports = withCustomerLiveActivity;
module.exports.configureProject = configureProject;
module.exports.declareExtension = declareExtension;
module.exports.TARGET = TARGET;
