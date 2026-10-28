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
const releaseLock = JSON.parse(fs.readFileSync(path.join(__dirname, 'release-lock.json'), 'utf8'));
check(releaseLock.version === '1.0.14' && releaseLock.buildNumber === '58' && releaseLock.bundleIdentifier === 'uk.tyrerescue.assistedchat' && releaseLock.teamId === 'BXK52CMHR2', 'Wrong finalized release identity');
check(manifest.version === releaseLock.version && manifest.buildNumber === releaseLock.buildNumber && manifest.bundleIdentifier === releaseLock.bundleIdentifier && manifest.projectId === '7b51b2be-7b4e-484e-bb94-82628e8253e5', 'Frozen manifest identity differs from finalized release');
check(/^[a-f0-9]{64}$/.test(releaseLock.sourceManifestSha256) && manifest.sourceManifestSha256 === releaseLock.sourceManifestSha256, 'Wrong frozen release');
check(Array.isArray(manifest.files) && hash(JSON.stringify(manifest.files)) === manifest.sourceManifestSha256 && manifest.files.length === manifest.fileCount && manifest.fileCount === releaseLock.sourceFiles && manifest.fileCount >= 288, 'Invalid frozen source manifest');
const expected = new Map(manifest.files.map(file => [file.path, file]));
check(expected.size === manifest.fileCount, 'Duplicate frozen source path');
check(process.version === 'v24.22.1', 'Node 24.22.1 is required for the frozen dependencies');
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
check(count === manifest.fileCount, 'Frozen source file count mismatch');
const expo = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
check(expo.version === '1.0.14' && pkg.version === '1.0.14' && expo.ios.buildNumber === '58', 'Unexpected app version');
check(expo.ios.bundleIdentifier === 'uk.tyrerescue.assistedchat' && expo.extra.eas.projectId === '7b51b2be-7b4e-484e-bb94-82628e8253e5', 'Unexpected application identity');
check(pkg.main === './src/startup-entry.js' && pkg.scripts.postinstall === 'node scripts/apply-patches.js', 'Startup or patch guard changed');
check(pkg.engines.node === '24.x', 'Unexpected Node engine');
check(/^[a-f0-9]{64}$/.test(releaseLock.packageLockSha256) && hash(fs.readFileSync(path.join(app, 'package-lock.json'))) === releaseLock.packageLockSha256, 'Lockfile mismatch');
check(process.env.EXPO_PUBLIC_API_BASE_URL === 'https://www.tyrerescue.uk', 'Wrong server URL');
check(/^pk\.[A-Za-z0-9_.-]+$/.test(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''), 'An explicit public Mapbox token is required');
check(!process.env.EXPO_PUBLIC_ADMIN_TOKEN && !process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP && !process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_SESSION_RESTORE, 'Forbidden release environment override');
const readSource = relative => fs.readFileSync(path.join(app, relative), 'utf8');
check(readSource('src/components/layout/ModalSafeAreaView.tsx').includes('<SafeAreaProvider') && readSource('src/components/layout/ModalSafeAreaView.tsx').includes('<SafeAreaView'), 'Modal safe-area ownership missing');
check(readSource('src/components/chat/ChatScreenLayout.tsx').includes('<ModalSafeAreaView') && readSource('src/components/TrackingModal.tsx').includes('<ModalSafeAreaView'), 'Chat or tracking safe-area fix missing');
check(readSource('src/lib/modal-presentation.ts').includes('didDismiss(owner: PrimaryModal)') && readSource('src/components/AssistedChatScreen.tsx').includes("modalPresentation.didDismiss('account')") && readSource('src/components/AssistedChatScreen.tsx').includes("modalPresentation.didDismiss('chat')"), 'iOS modal lifecycle fix missing');
check(readSource('src/components/AssistedChatScreen.tsx').includes('<HeaderLiveVisitorCounter state={liveVisitors}') && readSource('src/components/HeaderLiveVisitorCounter.tsx').includes('Visitor count changed.') && readSource('src/components/HeaderLiveVisitorCounter.tsx').includes('Animated.loop'), 'Animated visitor notice missing');
check(!readSource('src/components/AssistedChatScreen.tsx').includes('Choose a driver to start chatting'), 'Duplicate driver-chat launch card remains');
const allBookings = readSource('src/components/AdminBookingsModal.tsx');
const coordinateButton = readSource('src/components/CopyCoordinatesButton.tsx');
check((allBookings.match(/<CopyCoordinatesButton\b/g) || []).length === 2 && allBookings.includes('formatBookingCoordinatesForCopy'), 'All bookings coordinate-copy actions missing from detail or edit');
check(coordinateButton.includes('Copy coordinates') && coordinateButton.includes('Coordinates copied.') && coordinateButton.includes('copyToClipboard(value)'), 'All bookings coordinate-copy action or confirmation missing');
check(readSource('src/lib/booking-coordinates.ts').includes('export function formatBookingCoordinatesForCopy'), 'Booking coordinate formatter missing');
const screen = readSource('src/components/AssistedChatScreen.tsx');
const popup = readSource('src/components/HeaderIncomingCallPopup.tsx');
check(screen.includes('<BonlineCallManagementModal') && screen.includes('<BonlineCallButton') && screen.includes('incoming-call-notification-layer'), 'New call management or fixed popup layer missing');
const callerCard = readSource('src/components/IncomingCallerHistoryCard.tsx');
check(screen.includes('useIncomingPhoneCall({') && screen.includes('useIncomingCallerHistory({')
  && screen.includes('<IncomingCallerHistoryCard') && screen.includes('canAutofillIncomingPhone({')
  && screen.includes('incomingCallerDetailsBlockReason({'), 'Incoming caller integration or booking guards missing');
check(popup.includes('DISPLAY_DURATION_MS = 4_000') && popup.includes('Animated.sequence')
  && popup.includes('assisted-chat-header-incoming-call') && popup.includes('Returning customer')
  && popup.includes('History unavailable'), 'Four-second caller/history popup missing');
check(callerCard.includes('Incoming caller history') && callerCard.includes('Retry history check')
  && callerCard.includes('No previous bookings found for this number.'), 'Persistent caller history states missing');
check(readSource('src/hooks/useIncomingPhoneCall.ts').includes('/api/mobile/admin/phone/incoming-call')
  && readSource('src/hooks/useIncomingCallerHistory.ts').includes('/api/mobile/admin/customers/match?phone=')
  && readSource('src/hooks/useIncomingCallerHistory.ts').includes('LOOKUP_TIMEOUT_MS = 3_000'), 'Caller API integration or history deadline missing');
check(readSource('src/components/ReturningCustomerCard.tsx').includes('Previous booking price')
  && readSource('src/components/ReturningCustomerCard.tsx').includes("price ?? 'Not recorded'"), 'Previous booking price display missing');
const pluginNames = expo.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
check(pluginNames.includes('expo-secure-store') && pluginNames.includes('expo-notifications')
  && pluginNames.includes('expo-local-authentication'), 'Secure storage, notification or authentication native plugin missing');
const notificationsPlugin = expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications');
check(notificationsPlugin?.[1]?.sounds?.includes('./assets/sounds/assisted_notification.wav'), 'External notification sound is not configured for native bundling');
const notificationSound = fs.readFileSync(path.join(app, 'assets/sounds/assisted_notification.wav'));
check(hash(notificationSound) === '0479a7f42bbb815ba38f824c9b619fd70ace09ea381aa4c80ea692b723628ea2', 'External notification sound differs from selected source');
check(notificationSound.toString('ascii', 0, 4) === 'RIFF' && notificationSound.toString('ascii', 8, 12) === 'WAVE'
  && notificationSound.readUInt32LE(4) + 8 === notificationSound.length, 'External notification sound is not a complete RIFF WAV');
let soundFormat, soundDataBytes;
for (let offset = 12; offset + 8 <= notificationSound.length;) {
  const chunkName = notificationSound.toString('ascii', offset, offset + 4);
  const chunkLength = notificationSound.readUInt32LE(offset + 4);
  const start = offset + 8;
  check(start + chunkLength <= notificationSound.length, 'External notification WAV chunk exceeds file');
  if (chunkName === 'fmt ') soundFormat = notificationSound.subarray(start, start + chunkLength);
  if (chunkName === 'data') soundDataBytes = chunkLength;
  offset = start + chunkLength + (chunkLength % 2);
}
check(soundFormat?.length >= 16 && soundFormat.readUInt16LE(0) === 1 && soundFormat.readUInt16LE(2) === 1
  && soundFormat.readUInt32LE(4) === 44100 && soundFormat.readUInt32LE(8) === 88200
  && soundFormat.readUInt16LE(12) === 2 && soundFormat.readUInt16LE(14) === 16 && soundDataBytes === 617400,
  'External notification sound must be seven seconds of mono 44100 Hz PCM16');
check(readSource('src/lib/admin-session-storage.ts').includes("await import('expo-secure-store')")
  && readSource('src/lib/admin-session-storage.ts').includes('secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY'), 'Persistent secure session storage missing');
const release58Markers = ['When does the customer need us?', 'Call assistance', 'Review extracted details', 'Registered customers', 'First-time App Store downloads'];
const releaseSource = manifest.files.filter(file => /^src\/.*\.(?:tsx?|jsx?)$/.test(file.path)).map(file => readSource(file.path)).join('\n');
check(release58Markers.every(marker => releaseSource.includes(marker)), 'A required release 58 UI feature is missing');
if (process.argv.includes('--installed')) {
  const deps = ['expo', 'expo-audio', 'expo-local-authentication', 'expo-notifications', 'expo-secure-store'];
  for (const name of deps) check(require(path.join(app, 'node_modules', name, 'package.json')).version.startsWith('55.'), 'Unexpected native package version');
  const swift = fs.readFileSync(path.join(app, 'node_modules/expo-notifications/ios/ExpoNotifications/ServerRegistration/ServerRegistrationModule.swift'), 'utf8');
  check(swift.includes('fetchStringWithQuery(registrationGetQuery(), shouldThrowOnKeychainFailure: false)') && swift.includes('if !shouldThrowOnKeychainFailure'), 'Required notification native patch is missing');
  const secureStoreModule = JSON.parse(fs.readFileSync(path.join(app, 'node_modules/expo-secure-store/expo-module.config.json'), 'utf8'));
  check(secureStoreModule.apple.modules.includes('SecureStoreModule'), 'Native secure storage module registration missing');
}
console.log(JSON.stringify({ verified: true, version: '1.0.14', buildNumber: '58', sourceFiles: count, sourceManifestSha256: manifest.sourceManifestSha256, dependenciesVerified: process.argv.includes('--installed') }));
