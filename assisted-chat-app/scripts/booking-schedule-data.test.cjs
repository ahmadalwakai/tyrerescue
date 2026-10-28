const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const instant = Date.parse('2026-07-01T09:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return instant; }
}
function load(relative, dependencies = {}, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date: FixedDate, Error,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  });
  return module.exports;
}
const schedule = load('lib/booking-schedule.ts');
const workflow = load('lib/assisted-chat-workflow.ts', { './geo': load('lib/geo.ts'), './booking-schedule': schedule });
const pricing = load('lib/pricing-context.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const when = '2026-07-02T09:00:00.000Z';
function draft(extra = {}) {
  return {
    bookingType: 'scheduled', scheduledAt: when,
    customer: { name: 'Test customer', phone: '+447700900123', email: '' },
    location: { method: 'address', address: 'Test street', lat: 55.9, lng: -4.2, postcode: 'G1 1AA', link: null, whatsappLink: null, status: 'received' },
    serviceType: 'assess', tyreLines: [workflow.createBookingTyreLine({ id: 'tyre-1' })], vehicle: null,
    tyreConfirmedFromSidewall: false, lockingNut: { answer: 'unknown', chargeGbp: null },
    note: '', quickBookingId: null, virtualLandlineInteractionId: null, savedQuoteId: null, savedQuoteRef: null,
    quote: null, priceNeedsRefresh: false, manualPriceGbp: null, paymentChoice: null, paymentLink: null,
    dispatchedBookingId: null, dispatchedRefNumber: null, customerEmailMode: 'walk_in_customer', updatedAt: instant,
    ...extra,
  };
}

test('London slots convert consistently through GMT/BST and reject impossible or ambiguous wall times', () => {
  assert.equal(schedule.londonSlotToIso('2026-07-02', '10:00'), when);
  assert.equal(schedule.londonSlotToIso('2026-12-02', '10:00'), '2026-12-02T10:00:00.000Z');
  assert.equal(schedule.londonSlotToIso('2026-03-29', '01:30'), null);
  assert.equal(schedule.londonSlotToIso('2026-10-25', '01:30'), null);
  assert.equal(schedule.londonSlotToIso('2026-02-30', '10:00'), null);
  assert.equal(schedule.londonSlotToIso('2026-07-02', '24:00'), null);
  assert.equal(schedule.getLondonDateString(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
});

test('timing normalization preserves scheduled time while legacy emergency drafts discard stray dates', () => {
  assert.deepEqual(plain(schedule.normalizeBookingTiming({})), { bookingType: 'emergency', scheduledAt: null });
  assert.deepEqual(plain(schedule.normalizeBookingTiming({ bookingType: 'scheduled', scheduledAt: '2026-07-02T10:00:00+01:00' })), { bookingType: 'scheduled', scheduledAt: when });
  assert.deepEqual(plain(schedule.normalizeBookingTiming({ scheduledAt: when })), { bookingType: 'emergency', scheduledAt: null });
  assert.deepEqual(plain(schedule.normalizeBookingTiming({ bookingType: 'scheduled', scheduledAt: '2026-02-30T10:00:00Z' })), { bookingType: 'scheduled', scheduledAt: null });
});

test('the real draft hook restores timing and review protection, and migrates legacy drafts safely', async () => {
  for (const saved of [
    draft(),
    { ...draft(), bookingType: undefined, scheduledAt: undefined },
    draft({ bookingType: 'emergency', scheduledAt: null, bookingTimingNeedsReview: true, quickBookingId: 'quick', dispatchedBookingId: 'booked', quote: { total: 120 }, paymentChoice: 'deposit' }),
    draft({ bookingTimingNeedsReview: 'true' }),
  ]) {
    const state = { hooks: [], cursor: 0, effects: [], writes: [] };
    const react = {
      useState(initial) { const i = state.cursor++; if (!(i in state.hooks)) state.hooks[i] = { value: initial }; return [state.hooks[i].value, (next) => { state.hooks[i].value = typeof next === 'function' ? next(state.hooks[i].value) : next; }]; },
      useRef(initial) { const i = state.cursor++; if (!(i in state.hooks)) state.hooks[i] = { current: initial }; return state.hooks[i]; },
      useCallback(fn) { return fn; },
      useEffect(effect) { const i = state.cursor++; if (!(i in state.hooks)) { state.hooks[i] = {}; state.effects.push(effect); } },
    };
    const storage = { getItem: async () => JSON.stringify(saved), setItem: async (_, value) => { state.writes.push(JSON.parse(value)); }, removeItem: async () => {} };
    const loaded = load('hooks/useAssistedChatDraft.ts', {
      react, '@/lib/booking-schedule': schedule, '@/lib/assisted-chat-workflow': workflow,
      '@/lib/money': load('lib/money.ts', {}),
      '@react-native-async-storage/async-storage': { default: storage },
      '@/lib/startup-logging': { logStartupModuleCompleted() {}, logStartupModuleFailed() {}, logStartupModuleStarted() {} },
    }, { setTimeout(fn) { fn(); return 1; }, clearTimeout() {} });
    const read = () => { state.cursor = 0; return loaded.useAssistedChatDraft(); };
    read();
    for (const effect of state.effects) effect();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    const restored = read();
    assert.equal(restored.hydrated, true);
    assert.equal(restored.draft.bookingType, saved.bookingType ?? 'emergency');
    assert.equal(restored.draft.scheduledAt, saved.scheduledAt ?? null);
    assert.equal(restored.draft.bookingTimingNeedsReview, saved.bookingTimingNeedsReview === true);
    restored.update({ note: 'Reviewed by admin' });
    assert.equal(state.writes[0].bookingType, restored.draft.bookingType);
    assert.equal(state.writes[0].scheduledAt, restored.draft.scheduledAt);
    assert.equal(state.writes[0].bookingTimingNeedsReview, saved.bookingTimingNeedsReview === true);
    if (restored.draft.bookingTimingNeedsReview) {
      const dispatch = hookHarness('Dispatch', { draft: state.writes[0] });
      assert.equal(dispatch.read().bookingNeedsReview, true);
      assert.equal(dispatch.read().canRetryPaymentLink, false);
      assert.equal(await dispatch.read().retryPaymentLink(), false);
      assert.equal(dispatch.state.requests.length, 0);
      assert.match(dispatch.read().error, /Open Bookings/);
      restored.clear();
      assert.equal(read().draft.bookingTimingNeedsReview, false);
    }
  }
});

test('missing, passed and out-of-horizon appointments block pricing and booking review', () => {
  for (const scheduledAt of [null, 'not a date', '2026-07-01T08:00:00Z', '2026-07-16T10:00:00Z']) {
    const current = draft({ scheduledAt, quote: { total: 100 }, savedQuoteId: 'quote', paymentChoice: 'cash' });
    assert.ok(schedule.getBookingScheduleError(current));
    const state = workflow.getAssistedChatWorkflow({ draft: current, quoteStatus: 'CONFIRMED_BY_PHONE' });
    assert.equal(state.currentStage, 'PRICE');
    assert.equal(state.primaryActionDisabled, true);
  }
  assert.equal(schedule.getBookingScheduleError(draft()), null);
  assert.equal(schedule.getBookingScheduleError({ bookingType: 'emergency' }), null);
});

test('schedule changes invalidate price and confirmation but retain the same draft identity', () => {
  const before = draft({ quickBookingId: 'quick', savedQuoteId: 'saved', savedQuoteRef: 'Q1', quote: { total: 100 }, manualPriceGbp: 95, paymentChoice: 'cash' });
  const patch = schedule.buildBookingSchedulePatch(before, 'scheduled', '2026-07-03T09:00:00Z');
  const after = { ...before, ...patch };
  assert.equal(after.quickBookingId, 'quick');
  assert.equal(after.scheduledAt, '2026-07-03T09:00:00.000Z');
  for (const field of ['quote', 'savedQuoteId', 'savedQuoteRef', 'manualPriceGbp', 'paymentChoice', 'paymentLink']) assert.equal(after[field], null);
  assert.equal(after.priceNeedsRefresh, true);
  assert.equal(before.savedQuoteId, 'saved');
  assert.equal(schedule.buildBookingSchedulePatch(before, 'emergency', when).scheduledAt, null);
  assert.deepEqual(plain(schedule.buildBookingSchedulePatch(before, 'scheduled', when)), {});
});

test('created bookings and payment links cannot be turned into fresh scheduled drafts', () => {
  for (const field of ['dispatchedBookingId', 'dispatchedRefNumber', 'paymentLink']) {
    assert.throws(() => schedule.buildBookingSchedulePatch(draft({ [field]: 'existing' }), 'emergency', null), /already created/);
  }
});

test('a backend that ignores or changes scheduled time cannot authorize payment', () => {
  for (const response of [{}, { bookingType: 'emergency' }, { bookingType: 'scheduled', scheduledAt: '2026-07-03T09:00:00Z' }]) {
    assert.throws(() => schedule.assertBookingTimingResponse(draft(), response), /server did not confirm/);
  }
  assert.doesNotThrow(() => schedule.assertBookingTimingResponse(draft(), { bookingType: 'scheduled', scheduledAt: when }));
  assert.doesNotThrow(() => schedule.assertBookingTimingResponse({ bookingType: 'emergency' }, {}));
});

function hookHarness(kind, extra = {}) {
  const state = { draft: draft(extra.draft), hooks: [], cursor: 0, updates: [], requests: [], created: [], clipboard: [], opened: [], serverBooking: extra.serverBooking ?? null };
  const react = {
    useState(initial) { const i = state.cursor++; if (!(i in state.hooks)) state.hooks[i] = typeof initial === 'function' ? initial() : initial; return [state.hooks[i], (value) => { state.hooks[i] = typeof value === 'function' ? value(state.hooks[i]) : value; }]; },
    useRef(initial) { const i = state.cursor++; if (!(i in state.hooks)) state.hooks[i] = { current: initial }; return state.hooks[i]; },
    useCallback(fn) { return fn; }, useEffect(fn) { fn(); },
  };
  const breakdown = { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], bookingType: 'scheduled', scheduledAt: when, ...extra.priceBreakdown };
  const booking = () => ({ id: 'quick', distanceKm: '5', priceBreakdown: breakdown, ...(extra.legacy ? {} : { bookingType: 'scheduled', scheduledAt: when }) });
  class ApiError extends Error {}
  const api = {
    async get(url) { state.requests.push({ method: 'GET', url }); if (extra.locationBooking) return { booking: extra.locationBooking }; return state.serverBooking ? { finalized: true, canCollectPayment: false, response: state.serverBooking } : { finalized: false }; },
    async post(url, body) {
      state.requests.push({ method: 'POST', url, body });
      if (url.endsWith('/finalize')) return extra.finalizeResponse ?? { bookingId: 'booked', refNumber: 'SCHEDULED-1', paymentMethod: 'cash', paymentUrl: null, depositAmountPence: null, remainingBalancePence: null, bookingType: 'scheduled', scheduledAt: when, breakdown };
      if (url === '/api/admin/quotes') return { quote: { ...body, id: 'quote-new', quoteRef: 'QUOTE-1', selectedPaymentOption: null } };
      if (url.endsWith('/confirm')) return { quote: { ...body, id: 'quote-new', quoteRef: 'QUOTE-1', priceAmount: 12000 }, alreadyConfirmed: false };
      if (url.endsWith('/send-link')) return { ok: true, message: 'Test location link', link: 'https://example.test/location' };
      return { booking: booking() };
    },
    async patch(url, body) {
      state.requests.push({ method: 'PATCH', url, body });
      if (url.startsWith('/api/admin/quotes/')) return { quote: { ...body, id: 'quote-saved', quoteRef: 'QUOTE-1', selectedPaymentOption: null } };
      return { booking: booking() };
    },
  };
  const dependencies = {
    react, '@/lib/api': { api, ApiError, getApiContextRevision: () => 1 },
    '@/lib/booking-schedule': schedule, '@/lib/pricing-context': pricing, '@/lib/assisted-chat-workflow': workflow,
    '@/hooks/useLatestRef': { useLatestRef(value) { const ref = react.useRef(value); ref.current = value; return ref; } },
    'react-native': { Linking: { openURL: async (url) => { state.opened.push(url); } } },
    '@/lib/clipboard': { copyToClipboard: async (text) => { state.clipboard.push(text); return true; } },
    '@/lib/customer-message': { buildWhatsAppUrl: () => null },
  };
  const hook = load(`hooks/useAssistedChat${kind}.ts`, dependencies, { setTimeout(fn) { fn(); return 1; }, setInterval(fn) { state.poll = fn; return 1; }, clearInterval() {} });
  function read() {
    state.cursor = 0;
    return hook[`useAssistedChat${kind}`]({ draft: state.draft, effectiveTotal: 120, lockingNutCharge: 0, update(patch) { state.updates.push(patch); state.draft = { ...state.draft, ...patch }; }, onBookingCreated(value) { state.created.push(value); } });
  }
  return { state, read };
}

test('pricing sends scheduled context and appointment for create and reprice', async () => {
  for (const quickBookingId of [null, 'quick']) {
    const h = hookHarness('Price', { draft: { quickBookingId } });
    await h.read().getPrice();
    assert.equal(h.state.requests.length, 1);
    assert.equal(h.state.requests[0].body.bookingType, 'scheduled');
    assert.equal(h.state.requests[0].body.scheduledAt, when);
    assert.equal(h.state.requests[0].body.pricingContext, 'scheduled_mobile_fitting');
    assert.equal(h.state.draft.quote.scheduledAt, when);
    assert.equal(h.state.draft.quickBookingId, 'quick');
    assert.equal(h.read().error, null);
  }
});

test('pricing refuses missing appointments and backend responses without schedule support', async () => {
  const missing = hookHarness('Price', { draft: { scheduledAt: null } });
  await missing.read().getPrice();
  assert.equal(missing.state.requests.length, 0);
  assert.match(missing.read().error, /Choose a date/);
  const legacy = hookHarness('Price', { legacy: true });
  await legacy.read().getPrice();
  assert.equal(legacy.state.draft.quote, null);
  assert.match(legacy.read().error, /server did not confirm/);
});

test('explicit finalization syncs and finalizes the appointment, then preserves its server time', async () => {
  const h = hookHarness('Dispatch', { draft: { quickBookingId: 'quick', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } } });
  assert.equal(await h.read().choosePaymentAndDispatch('cash'), true);
  const writes = h.state.requests.filter((item) => item.method !== 'GET');
  assert.equal(writes.length, 2);
  for (const item of writes) { assert.equal(item.body.bookingType, 'scheduled'); assert.equal(item.body.scheduledAt, when); }
  assert.equal(h.state.draft.scheduledAt, when);
  assert.equal(h.state.draft.bookingType, 'scheduled');
  assert.equal(h.state.draft.dispatchedBookingId, 'booked');
  assert.equal(h.state.created.length, 1);
});

test('lost-response recovery restores scheduled booking after its time passed without another write', async () => {
  const scheduledAt = '2026-06-30T09:00:00.000Z';
  const h = hookHarness('Dispatch', {
    draft: { scheduledAt, quickBookingId: 'quick', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } },
    serverBooking: { bookingId: 'booked', refNumber: 'SCHEDULED-OLD', bookingType: 'scheduled', scheduledAt, paymentMethod: 'cash', paymentUrl: null, breakdown: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } },
  });
  assert.equal(await h.read().choosePaymentAndDispatch('cash'), true);
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.requests[0].method, 'GET');
  assert.equal(h.state.draft.scheduledAt, scheduledAt);
  assert.equal(h.state.draft.dispatchedBookingId, 'booked');
});

test('a finalize downgrade retains the real booking identity but cannot charge an unverified appointment', async () => {
  for (const timing of [{}, { bookingType: 'emergency', scheduledAt: null }, { bookingType: 'scheduled', scheduledAt: '2026-07-03T09:00:00Z' }]) {
    const h = hookHarness('Dispatch', {
      draft: { quickBookingId: 'quick', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } },
      finalizeResponse: { bookingId: 'booked', refNumber: 'UNVERIFIED-1', paymentMethod: 'deposit', paymentUrl: null, ...timing },
    });
    assert.equal(await h.read().choosePaymentAndDispatch('deposit'), false);
    assert.equal(h.state.draft.dispatchedBookingId, 'booked');
    assert.equal(h.state.draft.dispatchedRefNumber, 'UNVERIFIED-1');
    assert.equal(h.state.draft.bookingTimingNeedsReview, true);
    assert.equal(h.read().bookingNeedsReview, true);
    assert.equal(h.state.created[0].bookingTimingNeedsReview, true);
    const identityPatch = h.state.updates.find((patch) => patch.dispatchedBookingId === 'booked');
    assert.equal(identityPatch.bookingTimingNeedsReview, true);
    assert.equal(h.state.requests.length, 3);
    assert.equal(h.state.requests.some((item) => item.url.endsWith('/deposit') || item.url.endsWith('/checkout-session')), false);
    assert.match(h.read().error, /appointment does not match/);
    assert.equal(h.read().canRetryPaymentLink, false);
    if (timing.bookingType) assert.equal(h.state.draft.bookingType, timing.bookingType);
    assert.equal(await h.read().retryPaymentLink(), false);
    assert.equal(h.state.requests.length, 3);
  }
});

test('recovery with a different saved appointment shows its true time and stops before payment', async () => {
  const h = hookHarness('Dispatch', {
    draft: { quickBookingId: 'quick', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } },
    serverBooking: { bookingId: 'booked', refNumber: 'CHANGED-1', bookingType: 'scheduled', scheduledAt: '2026-07-03T09:00:00Z', paymentMethod: 'cash' },
  });
  assert.equal(await h.read().choosePaymentAndDispatch('cash'), false);
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.draft.scheduledAt, '2026-07-03T09:00:00.000Z');
  assert.match(h.read().error, /Open Bookings/);
});

test('location-link creation and contact refresh preserve scheduled timing', async () => {
  for (const quickBookingId of [null, 'quick']) {
    const h = hookHarness('LocationShare', { draft: { quickBookingId } });
    await h.read().requestLink('copy');
    assert.equal(h.state.requests[0].body.bookingType, 'scheduled');
    assert.equal(h.state.requests[0].body.scheduledAt, when);
    assert.equal(h.state.requests[0].body.pricingContext, 'scheduled_mobile_fitting');
    assert.equal(h.state.requests[1].url, '/api/admin/quick-book/send-link');
    assert.equal(h.state.draft.scheduledAt, when);
  }
});

test('a shared location arriving after a local schedule change supplies coordinates without restoring stale timing or price', async () => {
  const h = hookHarness('LocationShare', {
    draft: { quickBookingId: 'quick', location: { ...draft().location, method: 'link', status: 'pending', lat: null, lng: null }, savedQuoteId: 'old-quote', quote: { total: 999 } },
    locationBooking: {
      id: 'quick', bookingType: 'emergency', scheduledAt: null,
      locationLat: '55.8', locationLng: '-4.1', locationAddress: 'Customer shared position', locationPostcode: 'G1 1AA',
      distanceKm: '5', priceBreakdown: { subtotal: 800, vatAmount: 160, total: 960, lineItems: [] },
    },
  });
  h.read();
  await h.state.poll();
  assert.equal(h.state.draft.bookingType, 'scheduled');
  assert.equal(h.state.draft.scheduledAt, when);
  assert.equal(h.state.draft.location.lat, 55.8);
  assert.equal(h.state.draft.location.lng, -4.1);
  assert.equal(h.state.draft.location.status, 'received');
  assert.equal(h.state.draft.quote, null);
  assert.equal(h.state.draft.savedQuoteId, null);
  assert.equal(h.state.draft.priceNeedsRefresh, true);
  const reprice = hookHarness('Price', { draft: h.state.draft });
  await reprice.read().getPrice();
  assert.equal(reprice.state.requests[0].body.scheduledAt, when);
  assert.equal(reprice.state.requests[0].body.locationLat, 55.8);
  assert.equal(reprice.read().error, null);
});

test('saved quote requests carry timing and old same-total confirmation cannot survive a cleared quote id', async () => {
  const h = hookHarness('QuoteActions', { draft: { quickBookingId: 'quick', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } } });
  h.read().acceptExternalQuote({ id: 'old-quote', quoteRef: 'OLD', priceAmount: 12000, bookingType: 'scheduled', scheduledAt: when, selectedPaymentOption: 'CASH_ON_ARRIVAL', isExpired: false, quoteStatus: 'CONFIRMED_BY_PHONE' });
  assert.equal(h.read().currentQuote, null);
  await h.read().saveQuote();
  const priceRequest = h.state.requests.find((item) => item.method === 'PATCH');
  const quoteRequest = h.state.requests.find((item) => item.url === '/api/admin/quotes');
  assert.equal(priceRequest.body.pricingContext, 'scheduled_mobile_fitting');
  assert.equal(quoteRequest.body.bookingType, 'scheduled');
  assert.equal(quoteRequest.body.scheduledAt, when);
  assert.equal(h.state.draft.savedQuoteId, 'quote-new');
  assert.equal(h.read().currentQuote.id, 'quote-new');
  await h.read().confirmQuote();
  const confirmation = h.state.requests.find((item) => item.url.endsWith('/confirm'));
  assert.equal(confirmation.body.bookingType, 'scheduled');
  assert.equal(confirmation.body.scheduledAt, when);
  assert.equal(h.read().message.kind, 'ok');
});

test('resaving a linked quote refreshes its canonical price and preserves the operator adjustment', async () => {
  const h = hookHarness('QuoteActions', {
    draft: { quickBookingId: 'quick', savedQuoteId: 'quote-saved', manualPriceGbp: 95, quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 5 } },
    priceBreakdown: { subtotal: 79.17, vatAmount: 15.83, total: 95, adminAdjustmentAmount: -25 },
  });
  await h.read().saveQuote();
  assert.equal(h.state.requests.length, 2);
  const [priceRequest, quoteRequest] = h.state.requests;
  assert.equal(priceRequest.url, '/api/admin/quick-book/quick');
  assert.equal(priceRequest.body.adminAdjustmentAmount, -25);
  assert.equal(quoteRequest.url, '/api/admin/quotes/quote-saved');
  assert.equal(quoteRequest.body.refreshPrice, true);
  assert.equal(quoteRequest.body.priceAmount, 9500);
  assert.equal(quoteRequest.body.bookingType, 'scheduled');
  assert.equal(quoteRequest.body.scheduledAt, when);
  assert.equal(h.state.draft.manualPriceGbp, 95);
  assert.equal(h.read().currentQuote.priceAmount, 9500);
  assert.equal(h.read().message.kind, 'ok');
});

test('appointment review protection blocks price, location, and every quote mutation or customer message', async () => {
  const protectedDraft = { bookingTimingNeedsReview: true, quickBookingId: 'quick', savedQuoteId: 'quote-saved', dispatchedBookingId: 'booked', quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } };
  for (const [kind, action, args] of [
    ['Price', 'getPrice', []], ['LocationShare', 'requestLink', ['copy']],
    ...['saveQuote', 'confirmQuote', 'sendQuote', 'copyConfirmedMessage', 'copyPaymentInstruction'].map((action) => ['QuoteActions', action, []]),
  ]) {
    const h = hookHarness(kind, { draft: protectedDraft });
    await h.read()[action](...args);
    assert.equal(h.state.requests.length, 0, action);
    assert.equal(h.state.updates.length, 0, action);
    assert.equal(h.state.clipboard.length, 0, action);
    assert.equal(h.state.opened.length, 0, action);
    assert.equal(h.state.draft.dispatchedBookingId, 'booked');
    assert.match(h.read().error ?? h.read().message.text, /Open Bookings/, action);
  }
});

test('expired or cancelled cached quotes cannot be confirmed or copied and sent as current', async () => {
  for (const status of [{ quoteStatus: 'QUOTED', isExpired: true }, { quoteStatus: 'EXPIRED', isExpired: false }, { quoteStatus: 'CANCELLED', isExpired: false }]) {
    for (const action of ['confirmQuote', 'sendQuote', 'copyConfirmedMessage', 'copyPaymentInstruction']) {
      const h = hookHarness('QuoteActions', { draft: { quickBookingId: 'quick', savedQuoteId: 'quote-saved', quote: { total: 120 } } });
      h.read().acceptExternalQuote({ id: 'quote-saved', quoteRef: 'OLD', priceAmount: 12000, bookingType: 'scheduled', scheduledAt: when, ...status });
      await h.read()[action]();
      assert.equal(h.state.requests.length, 0, action);
      assert.equal(h.state.updates.length, 0, action);
      assert.equal(h.state.clipboard.length, 0, action);
      assert.equal(h.state.opened.length, 0, action);
      assert.match(h.read().message.text, /Refresh and save this quote/, action);
    }
  }
});

test('scheduled customer messages include UK appointment time', () => {
  const messages = load('lib/customer-message.ts', {
    './booking-schedule': schedule, './assisted-chat-workflow': workflow,
    './money': { formatGbp: (amount) => `£${amount}`, normalizePhoneForWhatsApp: () => '447700900123' },
  });
  const message = messages.buildCustomerMessage({ draft: draft(), effectiveTotal: 120 });
  assert.match(message, /Scheduled appointment: Thu, 2 Jul 2026, 10:00 \(UK time\)/);
  assert.equal(pricing.getAssistedChatPricingContext({ bookingType: 'emergency' }), 'emergency_mobile_fitting');
});
