/* Local-only QA fixtures. Start manually: node stock-app/scripts/qa-server.cjs
 * No production credentials, external services, or database connections are used.
 * Fixture login: qa@example.test, with any fake password, as admin or driver.
 * GET /__qa/state inspects requests and committed movement writes.
 * POST /__qa/control accepts { reset: true } or control flags described below.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This standalone fixture uses Node CommonJS.
const http = require('node:http');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This standalone fixture uses Node CommonJS.
const { randomUUID } = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = 8097;
const USER_ID = '10000000-0000-4000-8000-000000000001';
const DRIVER_ID = '11000000-0000-4000-8000-000000000001';
const CITY_ONE = '20000000-0000-4000-8000-000000000001';
const CITY_TWO = '20000000-0000-4000-8000-000000000002';
const WORKER_ID = '30000000-0000-4000-8000-000000000001';
const cities = [
  { id: CITY_ONE, slug: 'glasgow', name: 'Glasgow', isActive: true, roleInCity: 'manager' },
  { id: CITY_TWO, slug: 'edinburgh', name: 'Edinburgh', isActive: true, roleInCity: 'manager' },
];

const user = (role = 'admin', email = 'qa@example.test') => ({ id: USER_ID, name: 'QA Stock User', email, role, driverId: DRIVER_ID });
const cityById = (id) => cities.find(city => city.id === id);
const now = () => new Date().toISOString();
function shiftFor(cityId = CITY_ONE, userId = USER_ID) {
  const city = cityById(cityId);
  return {
    id: randomUUID(), userId, cityId, citySlug: city?.slug, cityName: city?.name,
    startedAt: now(), endedAt: null, status: 'active',
  };
}

function fixtures() {
  const products = Array.from({ length: 55 }, (_, index) => {
    const sizes = ['205/55/R16', '225/45/R17', '195/65/R15', '215/60/R16'];
    return {
      id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      brand: ['Michelin', 'Continental', 'Bridgestone', 'Goodyear', 'Pirelli'][index % 5],
      pattern: `QA Road ${String(index + 1).padStart(2, '0')}`,
      sizeDisplay: sizes[index] || `${175 + (index % 12) * 10}/${40 + (index % 6) * 5}/R${14 + (index % 8)}`,
      season: ['summer', 'winter', 'allseason'][index % 3], priceNew: 65 + index * 2.5, availableNew: true,
    };
  });
  const inventory = new Map(cities.map((city, cityIndex) => [city.id, products.map((product, index) => ({
    balanceId: randomUUID(), cityId: city.id, tyreProductId: product.id,
    product: { ...product, id: undefined },
    currentStock: index === 3 ? 0 : cityIndex ? 3 + (index % 4) : 12 + (index % 5),
    reservedStock: index === 0 ? 1 : 0, orderedStock: index % 7 === 0 ? 2 : 0,
    minStock: 3, targetStock: 20, updatedAt: now(),
  }))]));
  return {
    inventory, activeShift: shiftFor(), workerShift: shiftFor(CITY_ONE, WORKER_ID),
    movements: [], writes: [], shiftWrites: [], missingTyres: [], requests: [], idempotency: new Map(),
    controls: {
      inventoryDelayMs: 0, inventoryDelayByCity: {}, failInventory: false,
      nextMovementDropResponse: false, nextMovementFailAfterCommit: false, sharedWorkerMode: false,
      sessionStatus: 200, authStatus: 200, cityRole: 'manager',
    },
  };
}
let state = fixtures();

function snapshot(item) {
  return {
    ...item, availableStock: item.currentStock - item.reservedStock,
    suggestedBuy: Math.max(0, item.targetStock - item.currentStock - item.orderedStock),
  };
}
function summary(cityId) {
  const items = state.inventory.get(cityId) || [];
  return items.reduce((totals, item) => {
    totals.current += item.currentStock;
    totals.reserved += item.reservedStock;
    totals.available += item.currentStock - item.reservedStock;
    totals.toBuy += Math.max(0, item.targetStock - item.currentStock - item.orderedStock);
    return totals;
  }, { current: 0, available: 0, reserved: 0, toBuy: 0, totalProducts: items.length });
}
function reply(response, status, payload) {
  if (response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}
const fail = (response, status, message) => reply(response, status, { error: message });
async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 131072) throw new Error('QA request body exceeds 128 KiB');
  }
  return body ? JSON.parse(body) : {};
}
function stateView() {
  return {
    localOnly: true, fixtures: { user: user(), cities, cityOne: CITY_ONE, cityTwo: CITY_TWO, workerUserId: WORKER_ID },
    controls: state.controls, activeShift: state.activeShift, workerShift: state.workerShift,
    requests: state.requests, writes: state.writes, movements: state.movements,
    shiftWrites: state.shiftWrites, missingTyres: state.missingTyres,
    inventory: Object.fromEntries(cities.map(city => [city.id, { summary: summary(city.id), items: state.inventory.get(city.id).map(snapshot) }])),
  };
}
function applyControls(body) {
  if (body.reset) state = fixtures();
  const controls = { ...body, ...(body.flags || {}) };
  for (const key of Object.keys(state.controls)) {
    if (Object.hasOwn(controls, key)) state.controls[key] = controls[key];
  }
  if (Object.hasOwn(controls, 'activeShift')) {
    const requested = controls.activeShift;
    state.activeShift = requested === null || requested === false ? null
      : { ...shiftFor(requested?.cityId || CITY_ONE), ...(typeof requested === 'object' ? requested : {}) };
  }
  if (Object.hasOwn(controls, 'workerShift')) {
    const requested = controls.workerShift;
    state.workerShift = requested === null || requested === false ? null
      : { ...shiftFor(requested?.cityId || CITY_ONE, WORKER_ID), ...(typeof requested === 'object' ? requested : {}) };
  }
}

function recordMovement(request, response, body) {
  const existing = state.idempotency.get(body.idempotencyKey);
  if (body.idempotencyKey && existing) {
    if (existing.input !== JSON.stringify(body)) return fail(response, 409, 'This idempotency key belongs to a different movement');
    return reply(response, 200, { movement: existing.movement, alreadyApplied: true });
  }
  const type = body.movementType;
  const delta = body.quantityDelta;
  const item = state.inventory.get(body.cityId)?.find(item => item.tyreProductId === body.tyreProductId);
  if (!item) return fail(response, 404, 'Tyre product is not in this city stock');
  if (!['SALE', 'RECEIVED', 'DAMAGED', 'CORRECTION', 'RETURN'].includes(type)) return fail(response, 400, 'Invalid movement type');
  if (!Number.isInteger(delta) || delta === 0) return fail(response, 400, 'Quantity delta must be a non-zero integer');
  if (['SALE', 'DAMAGED'].includes(type) && delta > 0) return fail(response, 400, `${type} requires a negative quantity delta`);
  if (['RECEIVED', 'RETURN'].includes(type) && delta < 0) return fail(response, 400, `${type} requires a positive quantity delta`);
  if (state.controls.cityRole === 'viewer' || (type !== 'SALE' && state.controls.cityRole !== 'manager')) return fail(response, 403, 'No permission for this stock city movement');
  const shift = body.workerUserId ? state.workerShift : state.activeShift;
  if (body.workerUserId && !state.controls.sharedWorkerMode) return fail(response, 403, 'Worker selection is not enabled for this account');
  if (body.workerUserId && state.controls.cityRole !== 'manager') return fail(response, 403, 'Manager access required to record stock for another worker');
  if ((type === 'SALE' || body.workerUserId) && (!shift || shift.id !== body.shiftId || shift.cityId !== body.cityId)) return fail(response, 409, 'An active stock shift is required for this city');
  if (type === 'SALE' && !['GARAGE', 'EMERGENCY_CALL_OUT'].includes(body.saleChannel)) return fail(response, 400, 'A sale channel is required');
  if (type === 'SALE' && body.saleChannel === 'EMERGENCY_CALL_OUT' && !body.bookingId) return fail(response, 400, 'bookingId is required for emergency call-out sales');
  if (item.currentStock + delta < 0) return fail(response, 409, 'Insufficient stock');
  const previousBalance = item.currentStock;
  item.currentStock += delta;
  item.updatedAt = now();
  const movement = {
    id: randomUUID(), cityId: body.cityId, tyreProductId: body.tyreProductId, movementType: type,
    quantityDelta: delta, previousBalance, resultingBalance: item.currentStock,
    balanceBefore: previousBalance, balanceAfter: item.currentStock,
    actorName: body.workerUserId ? 'QA Stock Worker' : 'QA Stock User',
    saleChannel: body.saleChannel || null, occurredAt: now(), product: item.product,
    shiftId: body.shiftId || null, bookingId: body.bookingId || null, note: body.note || null,
    idempotencyKey: body.idempotencyKey || null,
  };
  state.movements.unshift(movement);
  state.writes.push({ ...body, movementId: movement.id, previousBalance, resultingBalance: item.currentStock });
  if (body.idempotencyKey) state.idempotency.set(body.idempotencyKey, { input: JSON.stringify(body), movement });
  if (state.controls.nextMovementFailAfterCommit) {
    state.controls.nextMovementFailAfterCommit = false;
    return fail(response, 503, 'QA response unavailable after commit');
  }
  if (state.controls.nextMovementDropResponse) {
    state.controls.nextMovementDropResponse = false;
    request.socket.destroy();
    return;
  }
  reply(response, 201, { movement, alreadyApplied: false });
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  try {
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
    const path = url.pathname;
    const method = request.method || 'GET';
    const body = ['POST', 'PATCH'].includes(method) ? await readBody(request) : {};
    if (method === 'GET' && path === '/__qa/state') return reply(response, 200, stateView());
    if (method === 'POST' && path === '/__qa/control') {
      applyControls(body);
      return reply(response, 200, { controls: state.controls, activeShift: state.activeShift, workerShift: state.workerShift });
    }
    if (path === '/health') return reply(response, 200, { ok: true, localOnly: true });
    state.requests.push({ method, path: `${path}${url.search}`, body: { ...body, ...(Object.hasOwn(body, 'password') ? { password: '[fixture password omitted]' } : {}) }, receivedAt: now() });
    if (state.requests.length > 2000) state.requests.shift();
    if (method === 'POST' && ['/api/mobile/admin/auth/login', '/api/driver/auth/login'].includes(path)) {
      const role = path.includes('/admin/') ? 'admin' : 'driver';
      return reply(response, 200, { token: `qa-stock-${role}-token`, user: user(role, body.email || 'qa@example.test') });
    }
    if (!request.headers.authorization?.startsWith('Bearer qa-stock-')) return fail(response, 401, 'QA fixture login required');
    if (state.controls.sessionStatus !== 200) return fail(response, Number(state.controls.sessionStatus) || 401, 'QA session rejected');
    if (method === 'GET' && ['/api/mobile/admin/auth/me', '/api/driver/profile'].includes(path)) {
      if (state.controls.authStatus !== 200) return fail(response, Number(state.controls.authStatus) || 503, 'QA session verification unavailable');
      return reply(response, 200, path.includes('/admin/') ? { user: user('admin') } : user('driver'));
    }
    if (method === 'GET' && path === '/api/stock/cities') return reply(response, 200, {
      items: cities.map(city => ({ ...city, roleInCity: state.controls.cityRole })), capabilities: { sharedWorkerMode: Boolean(state.controls.sharedWorkerMode) },
    });
    if (method === 'GET' && path === '/api/stock/shifts/active') return reply(response, 200, { shift: state.activeShift });
    if (method === 'POST' && path === '/api/stock/shifts/start') {
      if (!cityById(body.cityId)) return fail(response, 404, 'Stock city not found');
      const alreadyStarted = state.activeShift?.cityId === body.cityId;
      if (state.activeShift && !alreadyStarted) return fail(response, 409, 'End the existing shift before changing city');
      if (!alreadyStarted) state.activeShift = shiftFor(body.cityId);
      state.shiftWrites.push({ action: 'start', shift: state.activeShift });
      return reply(response, 200, { shift: state.activeShift, alreadyStarted });
    }
    if (method === 'POST' && path === '/api/stock/shifts/end') {
      if (!state.activeShift || state.activeShift.id !== body.shiftId) return fail(response, 404, 'No active shift');
      const shift = { ...state.activeShift, status: 'ended', endedAt: now() };
      state.activeShift = null;
      state.shiftWrites.push({ action: 'end', shift });
      return reply(response, 200, { shift, alreadyEnded: false });
    }
    if (path === '/api/stock/workers') {
      if (!state.controls.sharedWorkerMode) return fail(response, 403, 'Shared stock worker mode is not enabled for this account');
      if (method === 'GET') return reply(response, 200, { items: [{
        driverId: '31000000-0000-4000-8000-000000000001', userId: WORKER_ID, name: 'QA Stock Worker',
        email: 'worker@example.test', phone: null, isOnline: true, status: 'online',
        activeShift: !url.searchParams.get('cityId') || state.workerShift?.cityId === url.searchParams.get('cityId') ? state.workerShift : null,
      }] });
      if (method === 'POST' && body.action === 'start') {
        if (!cityById(body.cityId) || body.workerUserId !== WORKER_ID) return fail(response, 404, 'Worker or city not found');
        const alreadyStarted = state.workerShift?.cityId === body.cityId;
        if (!alreadyStarted) state.workerShift = shiftFor(body.cityId, WORKER_ID);
        return reply(response, 200, { shift: state.workerShift, alreadyStarted });
      }
      if (method === 'POST' && body.action === 'end') {
        if (!state.workerShift || state.workerShift.id !== body.shiftId) return fail(response, 404, 'No active worker shift');
        const shift = { ...state.workerShift, status: 'ended', endedAt: now() };
        state.workerShift = null;
        return reply(response, 200, { shift, alreadyEnded: false });
      }
    }
    const inventoryMatch = path.match(/^\/api\/stock\/cities\/([^/]+)\/inventory$/);
    if (inventoryMatch) {
      const cityId = decodeURIComponent(inventoryMatch[1]);
      const cityItems = state.inventory.get(cityId);
      if (!cityItems) return fail(response, 404, 'Stock city not found');
      if (method === 'PATCH') {
        const item = cityItems.find(item => item.tyreProductId === body.tyreProductId);
        if (!item) return fail(response, 404, 'Tyre product not found');
        if (!['summer', 'winter', 'allseason'].includes(body.season)) return fail(response, 400, 'Invalid season');
        for (const items of state.inventory.values()) {
          const product = items.find(item => item.tyreProductId === body.tyreProductId);
          if (product) product.product.season = body.season;
        }
        return reply(response, 200, { product: item.product });
      }
      if (method === 'GET') {
        const delay = Number(state.controls.inventoryDelayByCity?.[cityId] ?? state.controls.inventoryDelayMs) || 0;
        const failure = state.controls.failInventory;
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, Math.min(60_000, delay)));
        if (failure) return fail(response, typeof failure === 'number' ? failure : 503, 'QA inventory unavailable. Please retry.');
        const search = (url.searchParams.get('search') || '').trim().toLowerCase();
        const season = url.searchParams.get('season') || 'all';
        const sort = url.searchParams.get('sort') || 'size';
        const tyreProductId = url.searchParams.get('tyreProductId');
        if (tyreProductId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tyreProductId)) return fail(response, 400, 'Invalid tyreProductId filter');
        const page = Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1);
        const perPage = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('perPage'), 10) || 50));
        const filtered = cityItems.filter(item => (!search || `${item.product.brand} ${item.product.pattern} ${item.product.sizeDisplay}`.toLowerCase().includes(search)) && (season === 'all' || item.product.season === season) && (!tyreProductId || item.tyreProductId === tyreProductId));
        const compare = (a, b) => a.localeCompare(b, 'en', { numeric: true });
        const seasonOrder = { summer: 1, winter: 2, allseason: 3 };
        filtered.sort((a, b) => (sort === 'stock' ? (b.currentStock - b.reservedStock) - (a.currentStock - a.reservedStock)
          : sort === 'brand' ? compare(a.product.brand, b.product.brand)
            : sort === 'season' ? seasonOrder[a.product.season] - seasonOrder[b.product.season] : 0)
          || compare(a.product.sizeDisplay, b.product.sizeDisplay) || compare(a.product.brand, b.product.brand) || compare(a.product.pattern, b.product.pattern));
        return reply(response, 200, {
          city: cityById(cityId), page, totalCount: filtered.length, totalPages: Math.ceil(filtered.length / perPage),
          summary: summary(cityId), items: filtered.slice((page - 1) * perPage, page * perPage).map(snapshot),
        });
      }
    }
    const movementsMatch = path.match(/^\/api\/stock\/cities\/([^/]+)\/movements$/);
    if (method === 'GET' && movementsMatch) {
      const idempotencyKey = url.searchParams.get('idempotencyKey');
      if (idempotencyKey !== null && (!idempotencyKey.trim() || idempotencyKey.length > 200)) return fail(response, 400, 'Invalid idempotencyKey filter');
      return reply(response, 200, {
        items: state.movements.filter(item => item.cityId === movementsMatch[1] && (!idempotencyKey || item.idempotencyKey === idempotencyKey)).slice(0, Number(url.searchParams.get('perPage')) || 10),
      });
    }
    if (method === 'POST' && path === '/api/stock/movements') return recordMovement(request, response, body);
    if (method === 'POST' && path === '/api/stock/missing-tyres') {
      const item = { id: randomUUID(), ...body, occurredAt: now() };
      state.missingTyres.push(item);
      return reply(response, 201, { item });
    }
    fail(response, 404, `No local QA fixture for ${method} ${path}`);
  } catch (error) {
    fail(response, 400, error instanceof SyntaxError ? 'Invalid QA JSON request' : 'Unable to handle local QA request');
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Local Stock QA API listening at http://${HOST}:${PORT}`);
    console.log('Fixture login: qa@example.test, any fake password. GET /__qa/state; POST /__qa/control.');
  });
}
module.exports = { server, HOST, PORT };
