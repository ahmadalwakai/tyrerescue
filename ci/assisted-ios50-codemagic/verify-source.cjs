'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.CM_BUILD_DIR || process.cwd();
const app = path.resolve(root, process.env.ASSISTED_APP_DIR || 'assisted-chat-app');
const manifestPath = path.join(__dirname, 'source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function check(condition, label) { if (!condition) throw Error(label); }
check(manifest.sourceManifestSha256 === '0bdfd0c4640b6b541c704dee479df178ff1b187b4e460ac7487899d02503efe8', 'Wrong frozen release');
check(hash(JSON.stringify(manifest.files)) === manifest.sourceManifestSha256 && manifest.files.length === 223, 'Invalid frozen source manifest');
const expected = new Map(manifest.files.map(file => [file.file, file]));
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials\.json|\.git|\.vercel|android|ios)(?:\/|$)|\.(?:p8|p12|mobileprovision|pem|key|log|exit|pid|ps1|zip|tar|tgz)$/i;
const secret = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\./;
let count = 0;
function walk(relative = '') {
  for (const name of fs.readdirSync(path.join(app, relative))) {
    const key = relative ? relative + '/' + name : name;
    if (key === 'node_modules') continue;
    const file = path.join(app, key), stat = fs.lstatSync(file);
    check(!stat.isSymbolicLink(), 'Unexpected source symbolic link');
    check(!forbidden.test(key), 'Unexpected private or generated source file');
    if (stat.isDirectory()) { walk(key); continue; }
    check(stat.isFile() && expected.has(key), 'Unexpected source file');
    const bytes = fs.readFileSync(file), entry = expected.get(key);
    check(bytes.length === entry.bytes && hash(bytes) === entry.sha256, 'Frozen source integrity mismatch: ' + key);
    check(!secret.test(bytes.toString('utf8')), 'Private literal in source');
    count++;
  }
}
walk();
check(count === 223, 'Frozen source file count mismatch');
const expo = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
check(expo.version === '1.0.12' && pkg.version === '1.0.12' && expo.ios.buildNumber === '50', 'Unexpected app version');
check(expo.ios.bundleIdentifier === 'uk.tyrerescue.assistedchat' && expo.extra.eas.projectId === '7b51b2be-7b4e-484e-bb94-82628e8253e5', 'Unexpected application identity');
check(pkg.main === './src/startup-entry.js' && pkg.scripts.postinstall === 'node scripts/apply-patches.js', 'Startup or patch guard changed');
check(hash(fs.readFileSync(path.join(app, 'package-lock.json'))) === '1ef71bea01739d77bd82eeae55a74670c5335a8014db44139c15df8047cd680b', 'Lockfile mismatch');
check(process.env.EXPO_PUBLIC_API_BASE_URL === 'https://www.tyrerescue.uk', 'Wrong server URL');
check(/^pk\.[A-Za-z0-9_.-]+$/.test(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''), 'An explicit public Mapbox token is required');
check(!process.env.EXPO_PUBLIC_ADMIN_TOKEN && !process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP && !process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_SESSION_RESTORE, 'Forbidden release environment override');
const readSource = relative => fs.readFileSync(path.join(app, relative), 'utf8');
check(readSource('src/components/layout/ModalSafeAreaView.tsx').includes('<SafeAreaProvider') && readSource('src/components/layout/ModalSafeAreaView.tsx').includes('<SafeAreaView'), 'Modal safe-area ownership missing');
check(readSource('src/components/chat/ChatScreenLayout.tsx').includes('<ModalSafeAreaView') && readSource('src/components/TrackingModal.tsx').includes('<ModalSafeAreaView'), 'Chat or tracking safe-area fix missing');
check(readSource('src/lib/modal-presentation.ts').includes('didDismiss(owner: PrimaryModal)') && readSource('src/components/AssistedChatScreen.tsx').includes("modalPresentation.didDismiss('account')") && readSource('src/components/AssistedChatScreen.tsx').includes("modalPresentation.didDismiss('chat')"), 'iOS modal lifecycle fix missing');
check(readSource('src/components/AssistedChatScreen.tsx').includes('<HeaderLiveVisitorCounter state={liveVisitors}') && readSource('src/components/HeaderLiveVisitorCounter.tsx').includes('Visitor count changed.') && readSource('src/components/HeaderLiveVisitorCounter.tsx').includes('Animated.loop'), 'Animated visitor notice missing');
check(!readSource('src/components/AssistedChatScreen.tsx').includes('Choose a driver to start chatting'), 'Duplicate driver-chat launch card remains');
if (process.argv.includes('--installed')) {
  const deps = ['expo', 'expo-audio', 'expo-local-authentication', 'expo-notifications', 'expo-secure-store'];
  for (const name of deps) check(require(path.join(app, 'node_modules', name, 'package.json')).version.startsWith('55.'), 'Unexpected native package version');
  const swift = fs.readFileSync(path.join(app, 'node_modules/expo-notifications/ios/ExpoNotifications/ServerRegistration/ServerRegistrationModule.swift'), 'utf8');
  check(swift.includes('fetchStringWithQuery(registrationGetQuery(), shouldThrowOnKeychainFailure: false)') && swift.includes('if !shouldThrowOnKeychainFailure'), 'Required notification native patch is missing');
}
console.log(JSON.stringify({ verified: true, version: '1.0.12', buildNumber: '50', sourceFiles: count, sourceManifestSha256: manifest.sourceManifestSha256, dependenciesVerified: process.argv.includes('--installed') }));
