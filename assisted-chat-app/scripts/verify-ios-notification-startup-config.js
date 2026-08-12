/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NOTIFICATION_STARTUP_DISABLE_ENV =
  'EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP';

const projectRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));

function readJson(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function pluginListIncludesExpoNotifications(plugins) {
  return JSON.stringify(plugins ?? []).includes('expo-notifications');
}

const packageJson = readJson('package.json');
const appConfig = readJson('app.json');
const easConfig = fs.existsSync(path.join(projectRoot, 'eas.json'))
  ? readJson('eas.json')
  : {};

const iosAutolinkingExclude =
  packageJson.expo?.autolinking?.ios?.exclude;
const excludesExpoNotifications =
  Array.isArray(iosAutolinkingExclude) &&
  iosAutolinkingExclude.includes('expo-notifications');
const appConfigIncludesExpoNotifications = pluginListIncludesExpoNotifications(
  appConfig.expo?.plugins,
);
const productionEnv = easConfig.build?.production?.env ?? {};
const notificationStartupDisabled =
  productionEnv[NOTIFICATION_STARTUP_DISABLE_ENV] === 'true';

assert.equal(
  typeof appConfig.expo?.ios?.buildNumber,
  'string',
  'app.json must define expo.ios.buildNumber as a string',
);

if (excludesExpoNotifications) {
  assert.equal(
    notificationStartupDisabled,
    true,
    [
      'iOS production config is unsafe:',
      'expo-notifications is excluded from iOS autolinking,',
      `but ${NOTIFICATION_STARTUP_DISABLE_ENV} is not true.`,
      'The post-login protected effects can attempt notification startup without a linked native module.',
    ].join(' '),
  );
  assert.equal(
    appConfigIncludesExpoNotifications,
    false,
    'app.json should not configure expo-notifications while notification startup is disabled for the iOS-isolated build',
  );
} else {
  assert.equal(
    notificationStartupDisabled,
    false,
    [
      'iOS notification config is inconsistent:',
      'expo-notifications is linked, but notification startup is disabled.',
    ].join(' '),
  );
  assert.equal(
    appConfigIncludesExpoNotifications,
    true,
    'app.json must configure expo-notifications when iOS notification startup is enabled',
  );
}

console.log(
  [
    'ios notification startup config ok',
    `version=${appConfig.expo?.version ?? 'unknown'}`,
    `build=${appConfig.expo?.ios?.buildNumber ?? 'unknown'}`,
    `excluded=${excludesExpoNotifications}`,
    `startupDisabled=${notificationStartupDisabled}`,
  ].join(' '),
);
