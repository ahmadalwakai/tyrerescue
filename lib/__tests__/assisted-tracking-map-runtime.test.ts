import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  buildTrackingMapHtml,
  type TrackingMapState,
} from '../../assisted-chat-app/src/components/tracking/tracking-map-html';

type Listener = (event?: unknown) => void;

class ElementStub {
  tag: string;
  type = '';
  className = '';
  textContent = '';
  innerHTML = '';
  hidden = false;
  children: ElementStub[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, Listener> = {};
  properties: Record<string, string> = {};
  style = { setProperty: (key: string, value: string) => { this.properties[key] = value; } };
  constructor(tag = 'div') { this.tag = tag; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  getAttribute(key: string) { return this.attributes[key] ?? null; }
  appendChild(child: ElementStub) { this.children.push(child); }
  addEventListener(event: string, listener: Listener) { this.listeners[event] = listener; }
  click() { this.listeners.click?.({ stopPropagation() {} }); }
}

function driver(id: string, extra: Partial<TrackingMapState['drivers'][number]> = {}): TrackingMapState['drivers'][number] {
  return { id, name: `Driver ${id}`, phone: '+44 7700 900123', lat: 55.8642, lng: -4.2518, status: 'available', freshness: 'live', activeJobRef: null, lastSeenAt: null, selected: false, ...extra };
}

function job(id: string, extra: Partial<TrackingMapState['jobs'][number]> = {}): TrackingMapState['jobs'][number] {
  return { id, ref: `BOOK-${id}`, status: 'deposit_paid', customerName: 'Example customer', customerPhone: '+44 7700 900456', address: 'Example Street', tyreSummary: 'Two tyres', vehicleSummary: 'Example van', paymentLine: 'Cash to collect: £45.00', paymentNeedsCheck: true, lat: 55.8642, lng: -4.2518, assignmentStatus: 'assigned', selected: false, ...extra };
}

function state(extra: Partial<TrackingMapState> = {}): TrackingMapState {
  return { drivers: [], jobs: [], doFit: true, fitKey: 'today', ...extra };
}

function fixture(initial: TrackingMapState | null = null, options: { web?: boolean; missingMapbox?: boolean; failConstruction?: boolean } = {}) {
  const html = buildTrackingMapHtml('test-public-map-token', initial);
  const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)?.[1];
  if (!script) throw new Error('Missing map runtime');
  const status = new ElementStub();
  const documentListeners: Record<string, Listener> = {};
  const windowListeners: Record<string, Listener> = {};
  const posts: Array<Record<string, unknown>> = [];
  let map: MapStub;
  const popups: PopupStub[] = [];
  class BoundsStub {
    points: number[][] = [];
    extend(point: number[]) { this.points.push(point); return this; }
  }
  class MapStub {
    options: Record<string, unknown>;
    handlers: Record<string, Listener> = {};
    markers: MarkerStub[] = [];
    controls: Array<{ control: unknown; position: string }> = [];
    fits: Array<{ bounds: BoundsStub; options: Record<string, unknown> }> = [];
    eases: Array<Record<string, unknown>> = [];
    scale = 10000;
    contains = true;
    zoom = 11;
    constructor(config: Record<string, unknown>) {
      if (options.failConstruction) throw new Error('sensitive token-bearing provider error');
      this.options = config;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- The fixture exposes the runtime-created map for observable behavior assertions.
      map = this;
    }
    addControl(control: unknown, position: string) { this.controls.push({ control, position }); return this; }
    project(point: number[]) { return { x: point[0] * this.scale, y: point[1] * this.scale }; }
    on(event: string, listener: Listener) { this.handlers[event] = listener; return this; }
    emit(event: string, payload?: unknown) { this.handlers[event]?.(payload); }
    fitBounds(bounds: BoundsStub, fitOptions: Record<string, unknown>) { this.fits.push({ bounds, options: fitOptions }); }
    easeTo(camera: Record<string, unknown>) { this.eases.push(camera); }
    getBounds() { return { contains: () => this.contains }; }
    getZoom() { return this.zoom; }
    get visibleMarkers() { return this.markers.filter((marker) => !marker.removed); }
  }
  class MarkerStub {
    element: ElementStub;
    coordinate: number[] = [];
    removed = false;
    constructor(config: { element: ElementStub }) { this.element = config.element; }
    setLngLat(coordinate: number[]) { this.coordinate = coordinate; return this; }
    addTo(target: MapStub) { target.markers.push(this); return this; }
    remove() { this.removed = true; }
  }
  class PopupStub {
    options: Record<string, unknown>;
    html = '';
    coordinate: number[] = [];
    removed = false;
    listeners: Record<string, Listener> = {};
    constructor(config: Record<string, unknown> = {}) { this.options = config; popups.push(this); }
    setLngLat(coordinate: number[]) { this.coordinate = coordinate; return this; }
    setHTML(content: string) { this.html = content; return this; }
    addTo() { return this; }
    on(event: string, listener: Listener) { this.listeners[event] = listener; return this; }
    remove() { this.removed = true; this.listeners.close?.(); }
  }
  const parent = { postMessage: (payload: Record<string, unknown>) => posts.push(payload) };
  const window: Record<string, unknown> = {
    parent: options.web ? parent : null,
    addEventListener: (event: string, listener: Listener) => { windowListeners[event] = listener; },
  };
  if (!options.web) { window.parent = window; window.ReactNativeWebView = { postMessage: (payload: string) => posts.push(JSON.parse(payload)) }; }
  const context: Record<string, unknown> = {
    window,
    document: {
      getElementById: () => status,
      createElement: (tag: string) => new ElementStub(tag),
      addEventListener: (event: string, listener: Listener) => { documentListeners[event] = listener; },
    },
  };
  if (!options.missingMapbox) context.mapboxgl = {
    Map: MapStub, Marker: MarkerStub, Popup: PopupStub, LngLatBounds: BoundsStub,
    NavigationControl: class { constructor(public options: Record<string, unknown>) {} },
    ScaleControl: class { constructor(public options: Record<string, unknown>) {} },
  };
  runInNewContext(script, context);
  function apply(next: TrackingMapState) { (window.__applyState as (json: string) => void)(JSON.stringify(next)); }
  function action(name: string, key?: string) {
    const button = new ElementStub('button');
    button.setAttribute('data-action', name);
    if (key) button.setAttribute('data-key', key);
    documentListeners.click?.({ target: { closest: () => button }, preventDefault() {}, stopPropagation() {} });
  }
  function webMessage(data: unknown, source: unknown = parent) { windowListeners.message?.({ data, source }); }
  return { html, window, posts, status, popups, apply, action, webMessage, parent, get map() { return map; }, load: () => map.emit('load'), fitAll: () => (window.__fitAll as () => void)() };
}

describe('Assisted Chat tracking map runtime', () => {
  it('uses a readable street map with touch zoom controls, scale, and provider attribution', () => {
    const h = fixture();
    expect(h.map.options).toMatchObject({ style: 'mapbox://styles/mapbox/streets-v12', pitch: 0, bearing: 0, attributionControl: { compact: true } });
    expect(h.map.controls.map((entry) => entry.position)).toEqual(['top-right', 'bottom-left']);
    expect(h.html).toContain('width:44px!important;height:44px!important');
    // Mapbox positions each marker from the same origin; relative flow adds 44px per marker.
    expect(h.html).toMatch(/\.pin\{[^}]*position:absolute;/);
    expect(h.html).not.toMatch(/@keyframes|radar|shimmer/);
  });

  it('applies only the latest state received before map load and posts readiness to native', () => {
    const h = fixture(state({ drivers: [driver('initial')] }));
    h.apply(state({ drivers: [driver('older')] }));
    h.apply(state({ drivers: [driver('latest')] }));
    expect(h.map.visibleMarkers).toHaveLength(0);
    h.load();
    expect(h.map.visibleMarkers[0].element.attributes['aria-label']).toContain('Driver latest');
    expect(h.posts).toEqual([{ type: 'ready' }]);
    expect(h.status.hidden).toBe(true);
  });

  it('keeps driver availability and GPS status distinct from assigned and unassigned bookings', () => {
    const h = fixture(state({
      drivers: [
        driver('available', { lng: -4.1 }),
        driver('busy', { lng: -4.2, status: 'busy' }),
        driver('stale', { lng: -4.3, freshness: 'stale' }),
        driver('offline', { lng: -4.4, freshness: 'offline' }),
        driver('unknown-gps', { lng: -4.7, freshness: 'unknown' }),
      ],
      jobs: [job('assigned', { lng: -4.5 }), job('unassigned', { lng: -4.6, assignmentStatus: 'unassigned' })],
    }));
    h.load();
    expect(h.map.visibleMarkers.map((marker) => marker.element.properties['--pin-color'])).toEqual([
      '#15803d', '#c2410c', '#b45309', '#64748b', '#64748b', '#2563EB', '#DC2626',
    ]);
    expect(h.map.visibleMarkers.slice(0, 5).every((marker) => marker.element.className.includes('driver'))).toBe(true);
    expect(h.map.visibleMarkers.slice(5).every((marker) => marker.element.className.includes('job'))).toBe(true);
  });

  it('keeps drivers and jobs at identical real coordinates selectable without inventing displaced positions', () => {
    const h = fixture(state({ drivers: [driver('same')], jobs: [job('same')] }));
    h.load();
    expect(h.map.visibleMarkers).toHaveLength(1);
    const marker = h.map.visibleMarkers[0];
    expect(marker.coordinate).toEqual([-4.2518, 55.8642]);
    expect(marker.element.children[0].textContent).toBe('2');
    marker.element.click();
    expect(h.popups.at(-1)?.html).toContain('data-key="driver:same"');
    expect(h.popups.at(-1)?.html).toContain('data-key="job:same"');
    expect(h.popups.at(-1)?.html).not.toContain('data-action="expand"');
    h.action('select', 'job:same');
    expect(h.posts.at(-1)).toEqual({ type: 'mk', kind: 'job', id: 'same' });
    marker.element.click();
    h.action('select', 'driver:same');
    expect(h.posts.at(-1)).toEqual({ type: 'mk', kind: 'driver', id: 'same' });
  });

  it('groups nearby markers, shows the selected name, and expands into separate real markers when zoomed', () => {
    const h = fixture(state({ drivers: [driver('a'), driver('b', { lng: -4.2508, selected: true })], jobs: [job('c', { lat: 55.8652 })] }));
    h.load();
    const cluster = h.map.visibleMarkers[0];
    expect(cluster.element.className).toContain('sel');
    expect(cluster.coordinate).toEqual([-4.2508, 55.8642]);
    expect(cluster.element.children[1].textContent).toBe('Driver b');
    cluster.element.click();
    expect(h.popups.at(-1)?.html).toContain('2 drivers · 1 booking');
    h.action('expand');
    expect(h.map.fits.at(-1)?.options.maxZoom).toBe(14);
    expect(h.map.fits.at(-1)?.bounds.points).toHaveLength(3);
    h.map.scale = 100000;
    h.map.emit('moveend');
    expect(h.map.visibleMarkers).toHaveLength(3);
    expect(h.map.visibleMarkers.filter((marker) => marker.element.children.some((child) => child.className === 'pin-label'))).toHaveLength(1);
  });

  it('docks large choosers inside the map and scrolls their names independently of the Zoom action', () => {
    const h = fixture(state({ drivers: Array.from({ length: 12 }, (_, index) => driver(String(index))), jobs: [job('nearby', { lng: -4.2508 })] }));
    h.load();
    h.map.visibleMarkers[0].element.click();
    const popup = h.popups.at(-1);
    expect(popup?.options.className).toBe('hub-docked-popup');
    expect(popup?.html).toContain('class="hub-card group-card"');
    expect(popup?.html.match(/class="hub-choice"/g)).toHaveLength(13);
    expect(popup?.html).toMatch(/<\/div><div class="hub-tools"><button[^>]*data-action="expand"/);
    expect(h.html).toMatch(/\.mapboxgl-popup\.hub-docked-popup\{[^}]*left:12px!important;right:12px!important;top:auto!important;bottom:32px!important;transform:none!important/);
    expect(h.html).toContain('max-height:calc(100vh - 112px);overflow:auto');
    expect(h.html).toMatch(/\.hub-list\{[^}]*min-height:0;overflow:auto/);
    expect(h.html).toContain('max-width:420px!important;margin:0 auto;');
    expect(h.html).toMatch(/@media\(max-height:380px\)\{[\s\S]*?bottom:12px!important;max-height:calc\(100% - 24px\)/);
    expect(h.html).toContain('.group-card>.hub-kicker,.group-card>.hub-meta{display:none}');
    h.action('expand');
    expect(h.map.fits.at(-1)?.bounds.points).toHaveLength(13);
  });

  it('does not render malformed, impossible, missing, zero, or duplicate GPS markers', () => {
    const h = fixture();
    h.load();
    h.apply(state({ drivers: [driver('ok'), driver('ok'), driver('missing', { lat: null }), driver('north', { lat: 91 }), driver('west', { lng: -181 }), driver('zero', { lat: 0, lng: 0 }), driver('text', { lat: '55' as unknown as number }), driver('infinite', { lng: Infinity }), driver('')] }));
    expect(h.map.visibleMarkers).toHaveLength(1);
    expect(h.map.visibleMarkers[0].element.attributes['aria-label']).toContain('Driver ok');
  });

  it('keeps the camera on ordinary GPS polls and fits once per range plus explicit Fit all', () => {
    const h = fixture(state({ drivers: [driver('a'), driver('b', { lng: -3 })] }));
    h.load();
    expect(h.map.fits).toHaveLength(1);
    h.apply(state({ drivers: [driver('a', { lng: -4.26 }), driver('b', { lng: -3 })] }));
    expect(h.map.fits).toHaveLength(1);
    h.apply(state({ drivers: [driver('a'), driver('b', { lng: -3 })], fitKey: 'yesterday' }));
    expect(h.map.fits).toHaveLength(2);
    h.fitAll();
    expect(h.map.fits).toHaveLength(3);
    expect(h.map.fits.at(-1)?.bounds.points).toEqual([[-4.2518, 55.8642], [-3, 55.8642]]);
  });

  it('waits for actual locations before first-fit and brings a newly selected offscreen item into view once', () => {
    const h = fixture(state());
    h.load();
    h.apply(state({ drivers: [driver('a')] }));
    expect(h.map.eases).toHaveLength(1);
    h.map.contains = false;
    h.apply(state({ drivers: [driver('a', { selected: true })] }));
    expect(h.map.eases).toHaveLength(2);
    expect(h.map.eases.at(-1)?.center).toEqual([-4.2518, 55.8642]);
    h.apply(state({ drivers: [driver('a', { selected: true, lng: -4.26 })] }));
    expect(h.map.eases).toHaveLength(2);
  });

  it('preserves booking price warnings and details, and calls only the phone for the current actual record', () => {
    const h = fixture(state({ jobs: [job('a')] }));
    h.load();
    h.map.visibleMarkers[0].element.click();
    const content = h.popups.at(-1)?.html;
    expect(content).toContain('Check payment');
    expect(content).toContain('Cash to collect: £45.00');
    expect(content).toContain('Two tyres');
    expect(content).toContain('Example van');
    expect(content).toContain('Example Street');
    expect(content).not.toContain('>Paid<');
    h.action('call', 'job:a');
    expect(h.posts.at(-1)).toEqual({ type: 'call', phone: '+44 7700 900456' });
    h.apply(state({ jobs: [job('a', { paymentNeedsCheck: false, paymentLine: 'Paid · nothing to collect', customerPhone: null })] }));
    expect(h.popups.at(-1)?.html).toContain('>Paid<');
    const count = h.posts.length;
    h.action('call', 'job:a');
    expect(h.posts).toHaveLength(count);
  });

  it('refreshes an open chooser and refuses stale or forged marker identities', () => {
    const h = fixture(state({ drivers: [driver('a'), driver('b')] }));
    h.load();
    h.map.visibleMarkers[0].element.click();
    h.apply(state({ drivers: [driver('b', { name: 'Updated name' })] }));
    expect(h.popups.at(-1)?.html).toContain('Updated name');
    expect(h.popups.at(-1)?.html).not.toContain('data-key="driver:a"');
    const count = h.posts.length;
    h.action('select', 'driver:a');
    h.action('call', 'job:forged');
    expect(h.posts).toHaveLength(count);
    h.apply(state());
    expect(h.popups.at(-1)?.removed).toBe(true);
    expect(h.map.visibleMarkers).toHaveLength(0);
  });

  it('escapes every HTML payload and prevents initial-state or token script termination', () => {
    const malicious = '</script><img src=x onerror="alert(1)"> & <script>bad</script>';
    const html = buildTrackingMapHtml(malicious, state({ drivers: [driver('safe', { name: malicious })] }));
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).not.toContain('<img src=x');
    const h = fixture(state({ drivers: [driver('safe', { name: malicious, activeJobRef: '<unsafe>', phone: '\" data-action="forged' })] }));
    h.load();
    expect(h.map.visibleMarkers[0].element.children).toHaveLength(1);
    h.map.visibleMarkers[0].element.click();
    const content = h.popups.at(-1)?.html;
    expect(content).toContain('&lt;/script&gt;');
    expect(content).toContain('&lt;unsafe&gt;');
    expect(content).not.toContain('<img');
    expect(content).not.toContain('data-phone=');
  });

  it('accepts only the parent iframe protocol and returns the established web envelope', () => {
    const h = fixture(null, { web: true });
    h.load();
    expect(h.posts[0]).toEqual({ source: 'tyrerescue-tracking-map', payload: { type: 'ready' } });
    h.webMessage({ source: 'other-map', type: 'state', state: state({ drivers: [driver('bad')] }) });
    h.webMessage({ source: 'tyrerescue-tracking-map', type: 'state', state: state({ drivers: [driver('bad')] }) }, {});
    expect(h.map.visibleMarkers).toHaveLength(0);
    h.webMessage({ source: 'tyrerescue-tracking-map', type: 'state', state: state({ drivers: [driver('ok')] }) });
    h.map.visibleMarkers[0].element.click();
    expect(h.posts.at(-1)).toEqual({ source: 'tyrerescue-tracking-map', payload: { type: 'mk', kind: 'driver', id: 'ok' } });
    const fits = h.map.eases.length;
    h.webMessage({ source: 'tyrerescue-tracking-map', type: 'cmd', name: 'fit' });
    expect(h.map.eases).toHaveLength(fits + 1);
  });

  it.each([{ missingMapbox: true }, { failConstruction: true }])('reports a sanitized map initialization failure %j', (options) => {
    const h = fixture(null, options);
    expect(h.status.textContent).toMatch(/could not load/);
    expect(h.posts).toEqual([{ type: 'map-error' }]);
    expect(JSON.stringify(h.posts)).not.toMatch(/test-public-map-token|sensitive|provider/);
  });

  it('shows a recoverable load error without hiding an already usable map for a transient tile error', () => {
    const h = fixture();
    h.map.emit('error', { error: new Error('token-bearing URL') });
    expect(h.posts).toEqual([{ type: 'map-error' }]);
    h.load();
    expect(h.status.hidden).toBe(true);
    const count = h.posts.length;
    h.map.emit('error', { error: new Error('temporary tile') });
    expect(h.posts).toHaveLength(count);
    expect(h.status.hidden).toBe(true);
  });
});
