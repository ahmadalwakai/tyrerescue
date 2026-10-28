'use strict';
// Local preparation only: freezes already-integrated app bytes. Never copies
// source, reads credentials, contacts APIs, starts builds or submits releases.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sourceArg = process.argv[2];
assert(sourceArg && !sourceArg.startsWith('--'), 'Usage: node finalize-source.cjs <integrated-app-dir> [--dry-run]');
assert(process.argv.slice(3).every(value => value === '--dry-run'), 'Unexpected finalization argument');
const app = fs.realpathSync(sourceArg);
const destination = __dirname;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials\.json|\.git|\.vercel|android|ios)(?:\/|$)|\.(?:p8|p12|mobileprovision|pem|key|log|exit|pid|ps1|zip|tar|tgz)$/i;
const secret = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\./;
const files = [];
function walk(relative = '') {
  for (const name of fs.readdirSync(path.join(app, relative)).sort()) {
    const key = relative ? relative + '/' + name : name;
    if (key === 'node_modules') continue;
    assert(!forbidden.test(key), 'Unexpected private or generated source path');
    assert(!/[\\:\x00]/.test(key) && !key.split('/').includes('..'), 'Unsafe source path');
    const absolute = path.join(app, key);
    const stat = fs.lstatSync(absolute);
    assert(!stat.isSymbolicLink(), 'Source symbolic links are prohibited');
    if (stat.isDirectory()) { walk(key); continue; }
    assert(stat.isFile(), 'Expected only regular source files');
    const bytes = fs.readFileSync(absolute);
    assert(!secret.test(bytes.toString('utf8')), 'Private literal in source');
    files.push({ path: key, bytes: bytes.length, sha256: hash(bytes) });
  }
}
walk();
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
assert(files.length >= 288, 'The integrated source is incomplete');
const readJson = filename => JSON.parse(fs.readFileSync(path.join(app, filename), 'utf8').replace(/^\uFEFF/, ''));
const expo = readJson('app.json').expo;
const pkg = readJson('package.json');
const packageLock = readJson('package-lock.json');
assert(expo.version === '1.0.14' && pkg.version === '1.0.14' && expo.ios.buildNumber === '58', 'Wrong integrated release version');
assert(packageLock.version === '1.0.14' && packageLock.packages[''].version === '1.0.14', 'Lockfile release version differs');
assert(expo.ios.bundleIdentifier === 'uk.tyrerescue.assistedchat' && expo.extra.eas.projectId === '7b51b2be-7b4e-484e-bb94-82628e8253e5', 'Wrong application identity');
const selectedSound = files.find(file => file.path === 'assets/sounds/assisted_notification.wav');
assert(selectedSound?.sha256 === '0479a7f42bbb815ba38f824c9b619fd70ace09ea381aa4c80ea692b723628ea2', 'Selected external notification sound changed');
const sourceManifestSha256 = hash(JSON.stringify(files));
const manifest = {
  version: '1.0.14', buildNumber: '58', bundleIdentifier: expo.ios.bundleIdentifier,
  projectId: expo.extra.eas.projectId, sourceManifestSha256, files, fileCount: files.length,
};
const releaseLock = {
  version: manifest.version, buildNumber: manifest.buildNumber,
  bundleIdentifier: manifest.bundleIdentifier, teamId: 'BXK52CMHR2',
  appStoreAppId: '6786223270', sourceManifestSha256, sourceFiles: files.length,
  packageLockSha256: files.find(file => file.path === 'package-lock.json').sha256,
  externalNotificationSoundSha256: selectedSound.sha256,
};
if (!process.argv.includes('--dry-run')) {
  const manifestPath = path.join(destination, 'source-manifest.json');
  const lockPath = path.join(destination, 'release-lock.json');
  assert(!fs.existsSync(manifestPath) && !fs.existsSync(lockPath), 'A finalized release already exists; preserve it');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(lockPath, JSON.stringify(releaseLock, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ finalized: !process.argv.includes('--dry-run'), ...releaseLock }));
