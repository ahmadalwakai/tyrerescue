'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const check = (condition, label) => { if (!condition) throw new Error(label); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const root = process.env.CM_BUILD_DIR || process.cwd();
const app = path.resolve(root, process.env.DRIVER_APP_DIR || 'driver-app');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-manifest.json'), 'utf8'));
const expectedManifest = 'd958feb545e9c9dc58353619ecb2fd38b261b596179156a3966232e76ada6834';
check(manifest.sourceManifestSha256 === expectedManifest, 'Wrong frozen driver release');
check(hash(JSON.stringify(manifest.files)) === expectedManifest && manifest.files.length === manifest.fileCount, 'Invalid frozen source manifest');
const expected = new Map(manifest.files.map(file => [file.file, file]));
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials\.json|\.git|\.vercel|node_modules|android|ios|__tests__)(?:\/|$)|\.(?:test|spec)\.|\.(?:p8|p12|mobileprovision|pem|key|log|exit|pid|ps1|zip|tar|tgz)$/i;
const secret = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\./;
const filesOnly = process.argv.includes('--manifest-files-only');
check(!filesOnly || !process.env.CM_BUILD_ID, 'A CI build must verify the complete source directory');
let count = 0;
function verifyFile(key) {
  check(!forbidden.test(key), 'Private, generated or test source file');
  const file = path.join(app, key), stat = fs.lstatSync(file);
  check(!stat.isSymbolicLink() && stat.isFile() && expected.has(key), 'Unexpected driver source file');
  const bytes = fs.readFileSync(file), entry = expected.get(key);
  check(bytes.length === entry.bytes && hash(bytes) === entry.sha256, 'Frozen source integrity mismatch: ' + key);
  check(!secret.test(bytes.toString('utf8')), 'Private literal in source');
  count++;
}
function walk(relative = '') {
  for (const name of fs.readdirSync(path.join(app, relative))) {
    const key = relative ? relative + '/' + name : name;
    if (key === 'node_modules') continue;
    const file = path.join(app, key), stat = fs.lstatSync(file);
    check(!stat.isSymbolicLink() && !forbidden.test(key), 'Unexpected source directory or symbolic link');
    if (stat.isDirectory()) walk(key);
    else verifyFile(key);
  }
}
if (filesOnly) for (const entry of manifest.files) verifyFile(entry.file);
else walk();
check(count === manifest.fileCount, 'Frozen source file count mismatch');
const read = relative => fs.readFileSync(path.join(app, relative), 'utf8');
const expo = JSON.parse(read('app.json')).expo;
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
check(expo.version === '1.3.0' && pkg.version === '1.3.0' && expo.ios.buildNumber === '5', 'Unexpected frozen driver version');
check(expo.ios.bundleIdentifier === 'uk.tyrerescue.driver' && expo.extra.eas.projectId === 'c97a7bac-50da-42d8-9aef-3071d6b00925', 'Wrong driver application identity');
check(pkg.main === './src/services/background-location.ts' && !pkg.scripts.postinstall, 'Driver background entry or native patch policy changed');
check(process.env.EXPO_PUBLIC_API_URL === 'https://www.tyrerescue.uk', 'Wrong production driver API');
check(/^pk\.[A-Za-z0-9_.-]+$/.test(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''), 'Explicit public Mapbox token required');
for (const name of ['EXPO_PUBLIC_ADMIN_TOKEN', 'STRIPE_SECRET_KEY', 'EXPO_TOKEN', 'MAPBOX_DOWNLOADS_TOKEN', 'APP_STORE_CONNECT_PRIVATE_KEY']) {
  check(!process.env[name], 'Forbidden privileged runtime credential');
}
check(expo.ios.infoPlist.UIBackgroundModes.includes('location') && expo.ios.infoPlist.UIBackgroundModes.includes('remote-notification'), 'Driver background modes missing');
check(expo.ios.infoPlist.NSFaceIDUsageDescription && expo.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription, 'Driver permission descriptions missing');
const location = read('src/services/background-location.ts');
check(location.indexOf('TaskManager.defineTask(') >= 0 && location.indexOf('TaskManager.defineTask(') < location.indexOf("require('expo-router/entry')"), 'Background task must register before router entry');
check(location.includes('pausesUpdatesAutomatically: false') && location.includes('showsBackgroundLocationIndicator: true'), 'Continuous native GPS configuration missing');
const storage = read('src/services/secure-storage.ts');
check(storage.includes('uk.tyrerescue.driver.background.v2') && storage.includes('AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY') && storage.includes('requireAuthentication: false') && storage.includes("AppState.currentState !== 'active'"), 'Reviewed background Keychain migration missing');
check(read('src/services/online-location-state.ts').includes('const stored = await secureStorage.getItemAsync(ONLINE_LOCATION_ENABLED_KEY);'), 'Transient Online read protection missing');
const route = read('app/(tabs)/jobs/[ref]/route.tsx');
check(route.includes('evaluateRouteDeviation(') && route.includes('controller.signal') && route.includes('routeScreenAppState'), 'Reviewed route recovery missing');
check(read('src/lib/navigation/heading.ts').includes('resolveCompassHeading') && read('src/lib/navigation/nativeMapModel.ts').includes('nativeMapMarkerRotation'), 'Reviewed heading corrections missing');
check(read('src/components/navigation/DriverNavigationMap.tsx').includes('readCameraHeading') && read('src/components/navigation/DriverNavigationMap.tsx').includes('react-native-maps'), 'Native MapKit camera corrections missing');
check(read('src/constants/build-info.ts').includes('2026-10-23 driver-1.3 background-keychain mapkit-heading reroute-recovery'), 'Reviewed release marker missing');
if (process.argv.includes('--installed')) {
  for (const name of ['expo', 'react-native', 'expo-location', 'expo-task-manager', 'expo-secure-store', 'expo-local-authentication', 'expo-router', 'expo-notifications', 'react-native-maps', 'react-native-reanimated', 'react-native-worklets']) {
    const actual = require(path.join(app, 'node_modules', name, 'package.json')).version;
    check(actual === lock.packages['node_modules/' + name].version, 'Installed native dependency differs from reviewed lockfile');
  }
}
console.log(JSON.stringify({ verified: true, version: '1.3.0', sourceBuildNumber: '5', exportBuildNumber: '21', sourceFiles: count, sourceManifestSha256: expectedManifest, dependenciesVerified: process.argv.includes('--installed'), manifestFilesOnly: filesOnly, backgroundTaskEntryVerified: true, keychainMigrationVerified: true, navigationRecoveryVerified: true, publicValuesLogged: false }));
