const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../src/components');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.tsx') ? [full] : [];
  });
}
const SAFE_AREA = /ModalSafeAreaView|AdminModalShell|ChatScreenLayout|useSafeAreaInsets|SafeAreaView/;

test('every full-screen modal keeps its content clear of the status bar, Dynamic Island and home indicator', () => {
  const offenders = [];
  for (const file of walk(root)) {
    const source = fs.readFileSync(file, 'utf8');
    const modals = source.match(/<Modal\b[\s\S]*?>/g) ?? [];
    // A transparent modal is an overlay (centred card or popup); a full-screen one needs real insets.
    if (modals.some((tag) => !/\btransparent\b/.test(tag)) && !SAFE_AREA.test(source)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test('no header fakes the status bar height with a fixed top padding', () => {
  const offenders = walk(root).filter((file) => /\n\s{2,4}paddingTop:\s*(4[5-9]|5\d|6\d),/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});
