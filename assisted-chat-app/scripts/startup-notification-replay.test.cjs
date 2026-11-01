const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/components/AssistedChatScreen.tsx');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  const visit = (node) => { if (!result && predicate(node)) result = node; if (!result) ts.forEachChild(node, visit); };
  visit(source); assert.ok(result, 'Missing notification startup source behavior'); return result;
}
const startupEffect = find((node) => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
  && node.arguments[0]?.getText(source).includes('cachedStartupNotificationResponse')).arguments[0];
const moduleState = ['cachedStartupNotificationResponse', 'startupNotificationResponseHandled'].map((name) => {
  const statement = source.statements.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => ts.isIdentifier(item.name) && item.name.text === name));
  assert.ok(statement, `Missing module state ${name}`); return statement.getText(source);
}).join('\n');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 5; i += 1) await tick(); }
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// The real effect and its real module state run in one isolated VM. Mounts
// represent source-key screen replacements; native listeners are fixture-only.
function harness(options = {}) {
  const state = { reads: 0, responses: [], received: [], opened: [], errors: [], handler: options.handler ?? (async () => null) };
  const register = (collection, callback) => {
    const listener = { callback, removed: false }; collection.push(listener);
    return { remove: () => { listener.removed = true; } };
  };
  const compiled = ts.transpileModule(`${moduleState}\nexports.mount = (handleNotificationOpenData) => {
    const notifResponseRef = { current: null };
    return (${startupEffect.getText(source)})();
  };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Platform: { OS: options.platform ?? 'ios' },
    isNotificationStartupDisabled: () => options.disabled ?? false,
    getLastAdminNotificationResponseData: () => { state.reads += 1; return state.handler(); },
    addAdminNotificationResponseListener: (callback) => register(state.responses, callback),
    addAdminNotificationReceivedListener: (callback) => register(state.received, callback),
    getDriverJourneyNotificationOpenRequest: (data) => data?.route === 'driver_journey' ? data : null,
    logStartupModuleFailed: (label) => { state.errors.push(label); },
  }, { filename });
  return {
    state,
    mount: (workspace) => exports.mount((data) => { state.opened.push({ workspace, data }); }) ?? (() => {}),
    respond: (data) => { for (const item of state.responses) if (!item.removed) item.callback(data); },
    receive: (data) => { for (const item of state.received) if (!item.removed) item.callback(data); },
  };
}

test('cached launch tap is consumed once across workspace remounts while live responses and driver updates still work', async () => {
  const cached = { route: 'bookings', bookingId: 'fixture-launch-booking' };
  const h = harness({ handler: async () => cached }); const unmountFirst = h.mount('source_a'); await settle();
  assert.deepEqual(h.state.opened, [{ workspace: 'source_a', data: cached }]);
  const obsoleteCallback = h.state.responses[0].callback; unmountFirst(); h.mount('source_b'); await settle();
  assert.equal(h.state.reads, 1); assert.equal(h.state.opened.length, 1);
  const live = { route: 'bookings', bookingId: 'fixture-live-booking' }; h.respond(live);
  assert.deepEqual(h.state.opened.at(-1), { workspace: 'source_b', data: live });
  obsoleteCallback({ route: 'bookings', bookingId: 'fixture-obsolete' }); assert.equal(h.state.opened.length, 2);
  h.receive({ route: 'ordinary_notification' }); assert.equal(h.state.opened.length, 2);
  const journey = { route: 'driver_journey', journeyId: 'fixture-journey' }; h.receive(journey);
  assert.deepEqual(h.state.opened.at(-1), { workspace: 'source_b', data: journey });
  assert.ok(h.state.responses[0].removed); assert.ok(h.state.received[0].removed);
});

test('an in-flight launch read survives the first screen unmount and is consumed only by the next screen', async () => {
  const pending = deferred(); const h = harness({ handler: () => pending.promise });
  const unmount = h.mount('source_a'); unmount(); h.mount('source_b');
  assert.equal(h.state.reads, 1, 'remounts share the same pending native read');
  const cached = { route: 'bookings', bookingId: 'fixture-pending-launch' }; pending.resolve(cached); await settle();
  assert.deepEqual(h.state.opened, [{ workspace: 'source_b', data: cached }]);
  h.mount('source_c'); await settle(); assert.equal(h.state.reads, 1); assert.equal(h.state.opened.length, 1);
});

test('a failed native launch read is retryable on a later mount and does not disable live listeners', async () => {
  const pending = deferred(); const h = harness({ handler: () => pending.promise }); const unmount = h.mount('source_a');
  pending.reject(new Error('Fixture native read failure')); await settle();
  assert.equal(h.state.errors.length, 1); h.respond({ route: 'bookings', bookingId: 'fixture-live-after-failure' });
  assert.equal(h.state.opened.length, 1); unmount();
  h.state.handler = async () => ({ route: 'bookings', bookingId: 'fixture-retried-launch' }); h.mount('source_b'); await settle();
  assert.equal(h.state.reads, 2); assert.equal(h.state.opened.at(-1).data.bookingId, 'fixture-retried-launch');
  h.mount('source_c'); await settle(); assert.equal(h.state.reads, 2);
});

test('an empty launch response is consumed once and disabled startup performs no native reads or listener registration', async () => {
  const empty = harness(); const unmount = empty.mount('source_a'); await settle(); unmount(); empty.mount('source_b'); await settle();
  assert.equal(empty.state.reads, 1); assert.equal(empty.state.opened.length, 0);
  for (const options of [{ platform: 'web' }, { disabled: true }]) {
    const h = harness(options); h.mount('source_a'); await settle();
    assert.equal(h.state.reads, 0); assert.equal(h.state.responses.length, 0); assert.equal(h.state.received.length, 0);
  }
});
