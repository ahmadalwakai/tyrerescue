'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const check = (condition, label) => { if (!condition) throw new Error(label); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const root = process.env.CM_BUILD_DIR || process.cwd();
const app = path.resolve(root, process.env.CUSTOMER_APP_DIR || 'tyre-rescue');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-manifest.json'), 'utf8'));
check(manifest.sourceManifestSha256 === 'e512418d0f815b49ec4aa3f9c952facfc842b282736997b8199db1d677f9e352', 'Wrong frozen customer release');
check(hash(JSON.stringify(manifest.files)) === manifest.sourceManifestSha256 && manifest.files.length === manifest.fileCount, 'Invalid frozen source manifest');
const expected = new Map(manifest.files.map(file => [file.file, file]));
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials\.json|\.git|\.vercel|node_modules|android|ios|__tests__)(?:\/|$)|\.(?:test|spec)\.|\.(?:p8|p12|mobileprovision|pem|key|log|exit|pid|ps1|zip|tar|tgz)$/i;
const secret = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\./;
let count = 0;
function walk(relative = '') {
  for (const name of fs.readdirSync(path.join(app, relative))) {
    const key = relative ? relative + '/' + name : name;
    if (key === 'node_modules') continue;
    const file = path.join(app, key), stat = fs.lstatSync(file);
    check(!stat.isSymbolicLink(), 'Unexpected source symbolic link');
    check(!forbidden.test(key), 'Private, generated or test source file');
    if (stat.isDirectory()) { walk(key); continue; }
    check(stat.isFile() && expected.has(key), 'Unexpected customer source file');
    const bytes = fs.readFileSync(file), entry = expected.get(key);
    check(bytes.length === entry.bytes && hash(bytes) === entry.sha256, 'Frozen source integrity mismatch: ' + key);
    check(!secret.test(bytes.toString('utf8')), 'Private literal in source');
    count++;
  }
}
walk();
check(count === manifest.fileCount, 'Frozen source file count mismatch');
const expo = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(app, 'package-lock.json'), 'utf8'));
check(expo.version === '1.0.3' && pkg.version === '1.0.3' && expo.ios.buildNumber === '18', 'Unexpected customer version');
check(expo.ios.bundleIdentifier === 'uk.tyrerescue.customer' && expo.extra.eas.projectId === 'c97a7bac-50da-42d8-9aef-3071d6b00925', 'Wrong customer application identity');
check(pkg.main === 'expo-router/entry' && !pkg.scripts.postinstall, 'Customer entry or native patch policy changed');
check(expo.newArchEnabled === true, 'Mapbox requires the New Architecture');
check(hash(fs.readFileSync(path.join(app, 'package-lock.json'))) === '9a2db51b04857e361f26d4dbe0d19595821a3919665a0e85e7d598f86e309a0c', 'Customer lockfile mismatch');
check(process.env.EXPO_PUBLIC_API_BASE_URL === 'https://www.tyrerescue.uk', 'Wrong production customer API');
check(/^pk\.[A-Za-z0-9_.-]+$/.test(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''), 'Explicit public Mapbox token required');
check(/^pk_live_[A-Za-z0-9]+$/.test(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''), 'Explicit live Stripe publishable key required');
check(!process.env.EXPO_PUBLIC_ADMIN_TOKEN && !process.env.STRIPE_SECRET_KEY && !process.env.EXPO_TOKEN, 'Forbidden privileged runtime credential');
const read = relative => fs.readFileSync(path.join(app, relative), 'utf8');
check(read('src/customer-location-step.tsx').includes('Yes, use this location') && read('src/customer-location-step.tsx').includes('confirmLocation'), 'Reviewed GPS confirmation missing');
check(read('src/booking-safety.ts').includes('requireConfirmedBooking') && read('src/booking-safety.ts').includes('do not make another payment'), 'Reviewed payment confirmation guard missing');
check(read('src/booking-screen.tsx').includes('Review & confirm booking') && read('src/booking-screen.tsx').includes('requireConfirmedBooking(confirmation)'), 'Reviewed booking review or confirmation missing');
check(read('app/(tabs)/chat.tsx').includes('clientMessageId') && read('src/customer-chat.ts').includes('X-Booking-Access'), 'Reviewed customer chat access/retry safety missing');
const apiSource = read('src/api.ts').replaceAll('\r\n', '\n');
const nativeCookiePolicy = `export function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(endpoint(path), {
    ...init,
    ...(Platform.OS === 'web' ? {} : { credentials: 'omit' as const }),
  });
}`;
check(apiSource.includes(nativeCookiePolicy) && apiSource.includes('const res = await fetchApi(path, {'), 'Required native cookie omission cannot be overridden by caller credentials');
check(read('src/customer-chat.ts').includes('const response = await fetchApi(path, {'), 'Native chat cookie isolation missing');
check(read('src/booking-screen.tsx').includes('const res = await fetchApi(API.uploadTyrePhoto, {'), 'Native multipart upload cookie isolation missing');
check(read('components/haptic-tab.tsx').length > 0, 'Required customer tab component missing');
if (process.argv.includes('--installed')) {
  const names = ['expo', 'react-native', 'expo-constants', 'expo-notifications', 'expo-location', 'expo-image-picker', 'expo-secure-store', '@stripe/stripe-react-native', '@rnmapbox/maps'];
  for (const name of names) {
    const actual = require(path.join(app, 'node_modules', name, 'package.json')).version;
    check(actual === lock.packages['node_modules/' + name].version, 'Installed native dependency differs from reviewed lockfile');
  }
}
console.log(JSON.stringify({ verified: true, version: '1.0.3', buildNumber: '18', sourceFiles: count, sourceManifestSha256: manifest.sourceManifestSha256, dependenciesVerified: process.argv.includes('--installed'), nativeCookieIsolationVerified: true, liveStripeConfigured: true, publicMapboxConfigured: true, publicValuesLogged: false }));
