'use strict';

// --freeze honors GIT_INDEX_FILE and hashes staged blobs without changing the working index.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = process.env.CM_BUILD_DIR || path.resolve(__dirname, '../..');
const appRelative = process.env.CUSTOMER_APP_DIR || 'tyre-rescue';
const app = path.join(root, appRelative);
const ciRelative = process.env.CUSTOMER_CI_DIR || 'ci/customer-ios19-codemagic';
const manifestPath = path.join(root, ciRelative, 'source-manifest.json');
const check = (condition, label) => { if (!condition) throw new Error(label); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials\.json|\.git|\.vercel|node_modules|android|ios)(?:\/|$)|\.(?:p8|p12|mobileprovision|pem|key|log|exit|pid|ps1|zip|tar|tgz)$/i;
const privateLiteral = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\./;
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const frozenFile = file => {
  check(!forbidden.test(file), 'Private or generated artifact in staged customer release');
  const bytes = git('show', ':' + appRelative + '/' + file);
  check(!privateLiteral.test(bytes.toString('utf8')), 'Private literal in staged customer source');
  return { file, bytes: bytes.length, sha256: hash(bytes) };
};

if (process.argv.includes('--freeze')) {
  const destination = process.argv[process.argv.indexOf('--freeze') + 1];
  check(destination && !destination.startsWith('--'), 'Provide the source manifest destination after --freeze');
  const files = git('ls-files', '--cached', '-z', '--', appRelative).toString('utf8')
    .split('\0').filter(Boolean).map(file => file.slice(appRelative.length + 1)).sort().map(frozenFile);
  check(files.length > 20, 'No staged customer release to freeze');
  const expo = JSON.parse(git('show', ':' + appRelative + '/app.json').toString('utf8')).expo;
  const manifest = { version: expo.version, buildNumber: expo.ios.buildNumber, bundleIdentifier: expo.ios.bundleIdentifier, sourceManifestSha256: hash(JSON.stringify(files)), fileCount: files.length, files };
  const target = path.resolve(root, destination);
  check(target.startsWith(path.resolve(root) + path.sep), 'Manifest must stay in the release repository');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ frozen: true, version: manifest.version, buildNumber: manifest.buildNumber, sourceFiles: files.length, sourceManifestSha256: manifest.sourceManifestSha256 }));
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  check(hash(JSON.stringify(manifest.files)) === manifest.sourceManifestSha256 && manifest.files.length === manifest.fileCount, 'Invalid frozen source manifest');
  const expected = new Map(manifest.files.map(file => [file.file, file]));
  const generated = new Set(['node_modules', '.expo', 'ios', 'android', 'expo-env.d.ts', '.DS_Store']);
  let count = 0;
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(app, relative))) {
      if (!relative && generated.has(name)) continue;
      const key = relative ? relative + '/' + name : name;
      const filename = path.join(app, key);
      const stat = fs.lstatSync(filename);
      check(!stat.isSymbolicLink(), 'Unexpected customer source symbolic link');
      check(!forbidden.test(key), 'Private or generated customer source artifact');
      if (stat.isDirectory()) { walk(key); continue; }
      check(stat.isFile() && expected.has(key), 'Unexpected customer source file: ' + key);
      const bytes = fs.readFileSync(filename);
      const entry = expected.get(key);
      check(entry.bytes === bytes.length && entry.sha256 === hash(bytes), 'Frozen source mismatch: ' + key);
      check(!privateLiteral.test(bytes.toString('utf8')), 'Private literal in customer source');
      count += 1;
    }
  }
  walk();
  check(count === manifest.fileCount, 'Frozen source file count mismatch');
  const expo = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
  const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'package-lock.json'), 'utf8'));
  check(expo.version === '1.0.4' && pkg.version === expo.version && expo.ios.buildNumber === '19', 'Unexpected customer release version');
  check(expo.version === manifest.version && expo.ios.buildNumber === manifest.buildNumber, 'Frozen release metadata mismatch');
  check(expo.ios.bundleIdentifier === 'uk.tyrerescue.customer' && manifest.bundleIdentifier === expo.ios.bundleIdentifier, 'Wrong customer application identity');
  check(expo.extra.eas.projectId === 'c97a7bac-50da-42d8-9aef-3071d6b00925', 'Wrong existing notification project identity');
  check(pkg.main === 'expo-router/entry' && !pkg.scripts.postinstall, 'Unexpected customer entry or postinstall');
  check(expo.newArchEnabled === true && pkg.engines.node === '24.x', 'Customer native runtime requirements changed');
  check(process.env.EXPO_PUBLIC_API_BASE_URL === 'https://www.tyrerescue.uk', 'Explicit production customer HTTPS API required');
  check(/^pk\.[A-Za-z0-9_.-]+$/.test(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''), 'Explicit public Mapbox token required');
  check(/^pk_live_[A-Za-z0-9]+$/.test(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''), 'Explicit live Stripe publishable key required');
  check(!process.env.EXPO_PUBLIC_ADMIN_TOKEN && !process.env.STRIPE_SECRET_KEY && !process.env.EXPO_TOKEN, 'Forbidden privileged runtime credential');
  if (process.argv.includes('--installed')) {
    for (const name of ['expo', 'react-native', 'expo-constants', 'expo-notifications', 'expo-location', 'expo-image-picker', 'expo-secure-store', '@stripe/stripe-react-native', '@rnmapbox/maps']) {
      const actual = require(path.join(app, 'node_modules', name, 'package.json')).version;
      check(actual === lock.packages['node_modules/' + name].version, 'Installed native dependency differs from reviewed lockfile');
    }
  }
  console.log(JSON.stringify({ verified: true, version: expo.version, buildNumber: expo.ios.buildNumber, sourceFiles: count, sourceManifestSha256: manifest.sourceManifestSha256, dependenciesVerified: process.argv.includes('--installed'), productionPublicConfigurationVerified: true, publicValuesLogged: false }));
}
