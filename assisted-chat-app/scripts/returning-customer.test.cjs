const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

const geo = loadSource('lib/geo.ts', {});
const workflow = loadSource('lib/assisted-chat-workflow.ts', { './geo': geo, './booking-schedule': loadSource('lib/booking-schedule.ts', {}) });
const returning = loadSource('lib/returning-customer.ts', { './assisted-chat-workflow': workflow });

const emptyLocation = { method: 'address', address: '', lat: null, lng: null, postcode: null, link: null, whatsappLink: null, status: 'idle' };
const draft = (overrides = {}) => ({
  customer: { phone: '07700 900123', name: '', email: '' },
  location: emptyLocation,
  tyreLines: [workflow.createBookingTyreLine({ id: 'tyre-1', size: '', quantity: 1 })],
  quote: null,
  ...overrides,
});
const match = {
  key: 'account:1', confidence: 'linked_account', reasons: ['Phone number belongs to a customer account'],
  customer: { name: 'Cara Customer', phone: '+44 7700 900123', email: 'cara@isolated.invalid', accountLinked: true },
  bookingCount: 2,
  bookings: [{ refNumber: 'TYR-1', createdAt: '2026-10-01T10:00:00.000Z', status: 'completed', addressLine: '12 High Street, Glasgow G1 2AB',
    lat: 55.86, lng: -4.25, vehicleReg: 'SN12ABC', vehicleMake: null, vehicleModel: null, tyreSize: '205/55R16', quantity: 2,
    lockingNutStatus: 'has_key', paymentType: 'card', totalAmount: '120.50' }],
};

test('UK numbers normalise the same way as the server, other numbers do not', () => {
  assert.equal(returning.normalizeUkPhone('07700 900123'), '447700900123');
  assert.equal(returning.normalizeUkPhone('+44 7700 900123'), '447700900123');
  assert.equal(returning.normalizeUkPhone('0044 7700-900123'), '447700900123');
  assert.equal(returning.normalizeUkPhone('+44 (0)7700 900123'), '447700900123');
  assert.equal(returning.normalizeUkPhone('０７７００９００１２３'), '447700900123');
  assert.equal(returning.normalizeUkPhone('+44\u200b7700900123'), '447700900123');
  assert.equal(returning.normalizeUkPhone('07700900123 ext 4'), null);
  assert.equal(returning.normalizeUkPhone('+4407700900123'), null);
  assert.equal(returning.normalizeUkPhone('0770'), null);
  assert.equal(returning.normalizeUkPhone('+1 415 555 0100'), null);
});

test('an empty draft takes name, email, address and tyres from the match', () => {
  const { patch, filled } = returning.fillEmptyFromMatch(draft(), match);
  assert.deepEqual(Array.from(filled), ['name', 'email', 'address', 'tyre size']);
  assert.equal(patch.customer.name, 'Cara Customer');
  assert.equal(patch.customer.phone, '07700 900123');
  assert.equal(patch.location.status, 'received');
  assert.equal(patch.tyreLines[0].size, '205/55R16');
  assert.equal(patch.tyreLines[0].quantity, 2);
});

test('anything the operator already entered is never replaced', () => {
  const typed = draft({
    customer: { phone: '07700 900123', name: 'Typed Name', email: 'typed@isolated.invalid' },
    location: { ...emptyLocation, address: 'Typed address', lat: 55.9, lng: -4.3, status: 'received' },
    tyreLines: [workflow.createBookingTyreLine({ id: 'tyre-1', size: '195/65R15', quantity: 4 })],
  });
  const { patch, filled } = returning.fillEmptyFromMatch(typed, match);
  assert.equal(filled.length, 0);
  assert.deepEqual(Object.keys(patch), []);
});

test('a priced draft keeps its location and tyres even if they look empty', () => {
  const { filled } = returning.fillEmptyFromMatch(draft({ quote: { total: 100 } }), match);
  assert.deepEqual(Array.from(filled), ['name', 'email']);
});

test('the lookup sends only a valid UK number and a confirmed address; tyre size only with the address', () => {
  const query = (input) => Object.fromEntries(new URLSearchParams(returning.buildMatchQuery(input)));
  assert.deepEqual(query({ phone: '07700 900123', confirmedAddress: null, tyreSize: '205/55R16' }), { phone: '447700900123' });
  assert.deepEqual(query({ phone: '0770', confirmedAddress: '12 High Street, Glasgow G1 2AB', tyreSize: '205/55R16' }),
    { address: '12 High Street, Glasgow G1 2AB', tyreSize: '205/55R16' });
  assert.equal(returning.buildMatchQuery({ phone: '+1 415 555 0100', confirmedAddress: null, tyreSize: '' }), '');
  assert.equal(returning.buildMatchQuery({ phone: '', confirmedAddress: '   ', tyreSize: '205/55R16' }), '');
});

test('caller details are usable only for a blank draft or the same normalized phone', () => {
  const context = { callerPhone: '+447700900123', phoneInput: '', customerPhone: '', hasSavedBooking: false };
  assert.equal(returning.incomingCallerDetailsBlockReason(context), null);
  assert.equal(returning.incomingCallerDetailsBlockReason({ ...context, phoneInput: '07700 900123', customerPhone: '00447700900123' }), null);
  assert.match(returning.incomingCallerDetailsBlockReason({ ...context, phoneInput: '07700900456' }), /different phone/);
  assert.match(returning.incomingCallerDetailsBlockReason({ ...context, customerPhone: '07700900456' }), /different phone/);
  // Typing a new number before React commits must also block copying old details.
  assert.match(returning.incomingCallerDetailsBlockReason({ ...context, phoneInput: '07' }), /different phone/);
});

test('saved bookings and unsupported caller numbers never accept caller history details', () => {
  const context = { callerPhone: '+447700900123', phoneInput: '', customerPhone: '', hasSavedBooking: true };
  assert.match(returning.incomingCallerDetailsBlockReason(context), /new booking/);
  assert.match(returning.incomingCallerDetailsBlockReason({ ...context, hasSavedBooking: false, callerPhone: '+14155550100' }), /could not be verified/);
});
