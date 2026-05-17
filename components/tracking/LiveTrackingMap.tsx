'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TrackingPoint, TrackingRouteMode } from '@/types/tracking';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export interface LiveTrackingMapProps {
  driver: TrackingPoint | null;
  customer: TrackingPoint | null;
  /** Label rendered above the customer pin. Defaults to "Customer". */
  customerLabel?: string;
  /** Label rendered above the driver pin. Defaults to "Driver". */
  driverLabel?: string;
  /**
   * When false, the map will not attempt to fetch a Mapbox Directions
   * route and will always draw a straight line. Useful when the page
   * already shows a tiny inline map and the Directions call is wasteful.
   */
  enableRouting?: boolean;
  /** Tells parent which line is currently drawn (route / direct / none). */
  onRouteModeChange?: (mode: TrackingRouteMode) => void;
  /** Compact map height (driver/customer pages use the full container). */
  className?: string;
}

const ROUTE_SOURCE = 'live-tracking-route';
const ROUTE_LAYER = 'live-tracking-route-layer';
const TRAIL_SOURCE = 'live-tracking-trail';
const TRAIL_LAYER = 'live-tracking-trail-layer';
/** How many previous driver fixes to keep as faint trail dots. */
const TRAIL_MAX = 3;

/** Inline orange van SVG used for the driver marker. ~36×20 viewBox. */
const VAN_SVG = `
<svg width="40" height="24" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="2" y="5" width="22" height="13" rx="2.5" fill="#F97316" stroke="#2A0F03" stroke-width="1.2"/>
  <polygon points="24,7 33,11 33,18 24,18" fill="#F97316" stroke="#2A0F03" stroke-width="1.2" stroke-linejoin="round"/>
  <rect x="25.5" y="8.5" width="6" height="4" rx="0.6" fill="#FED7AA"/>
  <circle cx="9" cy="19.5" r="3" fill="#0a0a0a" stroke="#FAFAFA" stroke-width="0.8"/>
  <circle cx="27.5" cy="19.5" r="3" fill="#0a0a0a" stroke="#FAFAFA" stroke-width="0.8"/>
</svg>`;

function buildMarkerEl(opts: {
  color: string;
  ringColor: string;
  label: string;
  /** When true, replace the dot with a van SVG and use a slightly bigger hit area. */
  isVan?: boolean;
}): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;';

  // Pulse host carries the slow expanding ring + (optionally) a one-shot
  // ping. Sized to match the visible pin so the ring scales from it.
  const pulseHost = document.createElement('div');
  const size = opts.isVan ? 40 : 20;
  pulseHost.style.cssText = `position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;`;

  const ring = document.createElement('span');
  ring.className = 'tr-pulse-ring';
  ring.style.cssText = `background:${opts.color};opacity:0.45;`;
  pulseHost.appendChild(ring);

  const pin = document.createElement('div');
  if (opts.isVan) {
    pin.innerHTML = VAN_SVG;
    pin.style.cssText = `position:relative;width:${size}px;height:24px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.55));`;
  } else {
    pin.style.cssText = `position:relative;width:20px;height:20px;border-radius:50%;background:${opts.color};border:3px solid ${opts.ringColor};box-shadow:0 4px 10px rgba(0,0,0,0.45);`;
  }
  pulseHost.appendChild(pin);

  const tag = document.createElement('span');
  tag.textContent = opts.label;
  tag.style.cssText =
    'font:600 11px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#FAFAFA;background:rgba(9,9,11,0.85);padding:3px 7px;border-radius:6px;letter-spacing:0.02em;text-transform:uppercase;';

  wrap.appendChild(pulseHost);
  wrap.appendChild(tag);
  return wrap;
}

/** Trigger a one-shot "ping" expansion on the marker element (driver moved). */
function pingMarker(el: HTMLElement | null, color: string) {
  if (!el) return;
  const host = el.firstElementChild as HTMLElement | null;
  if (!host) return;
  const ping = document.createElement('span');
  ping.className = 'tr-ping';
  const size = host.clientWidth || 32;
  ping.style.cssText = `width:${size}px;height:${size}px;background:${color};opacity:0.7;`;
  host.appendChild(ping);
  // Auto-clean after the animation finishes (matches keyframe duration).
  window.setTimeout(() => ping.remove(), 1_000);
}

/**
 * Full-featured Mapbox tracking map used by the public customer/driver
 * pages. Draws both pins, fits the viewport to include both, and overlays
 * a Mapbox Directions route when both endpoints exist. Falls back to a
 * direct dashed line if routing fails or only one endpoint exists.
 *
 * The map instance is created once and reused across snapshot updates;
 * markers/layers are mutated in place to avoid flicker.
 */
export function LiveTrackingMap({
  driver,
  customer,
  customerLabel = 'Customer',
  driverLabel = 'Driver',
  enableRouting = true,
  onRouteModeChange,
  className,
}: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const customerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const styleLoadedRef = useRef(false);
  const lastBoundsKeyRef = useRef<string | null>(null);
  const lastRouteKeyRef = useRef<string | null>(null);
  /** Last driver coord we drew a marker for — used to detect movement. */
  const lastDriverKeyRef = useRef<string | null>(null);
  /** FIFO of previous driver fixes used as the faint trail. */
  const driverTrailRef = useRef<TrackingPoint[]>([]);

  const [error, setError] = useState<string | null>(null);

  // ── Init map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) {
      setError('Mapbox token is missing — set NEXT_PUBLIC_MAPBOX_TOKEN.');
      return;
    }
    const initLat = driver?.lat ?? customer?.lat ?? 55.8642;
    const initLng = driver?.lng ?? customer?.lng ?? -4.2518;
    try {
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [initLng, initLat],
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current.addControl(
        new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
        'top-right',
      );
      mapRef.current.on('load', () => {
        styleLoadedRef.current = true;
      });
      mapRef.current.on('error', () => {
        setError('Map could not load. Tracking is still active.');
      });
    } catch {
      setError('Map could not load. Tracking is still active.');
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      customerMarkerRef.current = null;
      styleLoadedRef.current = false;
      // Reset cached keys so the route/bounds effects redraw against the
      // freshly-created map after a StrictMode double-mount (or any remount).
      lastBoundsKeyRef.current = null;
      lastRouteKeyRef.current = null;
      lastDriverKeyRef.current = null;
      driverTrailRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Customer marker ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!customer) {
      customerMarkerRef.current?.remove();
      customerMarkerRef.current = null;
      return;
    }
    if (!customerMarkerRef.current) {
      const el = buildMarkerEl({ color: '#22c55e', ringColor: '#022c0e', label: customerLabel });
      customerMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([customer.lng, customer.lat])
        .addTo(map);
    } else {
      customerMarkerRef.current.setLngLat([customer.lng, customer.lat]);
    }
  }, [customer, customerLabel]);

  // ── Driver marker ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driver) {
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      lastDriverKeyRef.current = null;
      return;
    }
    if (!driverMarkerRef.current) {
      const el = buildMarkerEl({
        color: '#F97316',
        ringColor: '#2A0F03',
        label: driverLabel,
        isVan: true,
      });
      driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driver.lng, driver.lat]);
    }

    // One-shot ping + trail update when the driver actually moved.
    const key = `${driver.lat.toFixed(5)},${driver.lng.toFixed(5)}`;
    if (lastDriverKeyRef.current && lastDriverKeyRef.current !== key) {
      pingMarker(driverMarkerRef.current.getElement(), '#F97316');
      const prev = driverTrailRef.current;
      // Push the previous point (not the new one) onto the trail.
      const [prevLat, prevLng] = lastDriverKeyRef.current.split(',').map(Number);
      if (Number.isFinite(prevLat) && Number.isFinite(prevLng)) {
        driverTrailRef.current = [...prev, { lat: prevLat, lng: prevLng }].slice(-TRAIL_MAX);
      }
    }
    lastDriverKeyRef.current = key;

    // Trail layer (faint circle for each prior fix). Re-create on each
    // movement so we don't accumulate stale features.
    const trail = driverTrailRef.current;
    const drawTrail = () => {
      if (!mapRef.current) return;
      const m = mapRef.current;
      const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: 'FeatureCollection',
        features: trail.map((p, i) => ({
          type: 'Feature',
          properties: { idx: i },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      };
      const existing = m.getSource(TRAIL_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        m.addSource(TRAIL_SOURCE, { type: 'geojson', data });
        m.addLayer({
          id: TRAIL_LAYER,
          type: 'circle',
          source: TRAIL_SOURCE,
          paint: {
            'circle-radius': 4,
            'circle-color': '#F97316',
            'circle-opacity': 0.35,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#F97316',
            'circle-stroke-opacity': 0.55,
          },
        });
        // Keep the route line painted *over* the trail dots if present.
        if (m.getLayer(ROUTE_LAYER)) m.moveLayer(ROUTE_LAYER);
      }
    };
    if (styleLoadedRef.current) drawTrail();
    else map.once('load', drawTrail);
  }, [driver, driverLabel]);

  // ── Fit bounds whenever pins move (debounced via key) ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = `${driver?.lat ?? 'x'},${driver?.lng ?? 'x'}|${customer?.lat ?? 'x'},${customer?.lng ?? 'x'}`;
    if (key === lastBoundsKeyRef.current) return;
    lastBoundsKeyRef.current = key;
    if (driver && customer) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([driver.lng, driver.lat])
        .extend([customer.lng, customer.lat]);
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 700 });
    } else if (driver) {
      map.easeTo({ center: [driver.lng, driver.lat], zoom: 14, duration: 600 });
    } else if (customer) {
      map.easeTo({ center: [customer.lng, customer.lat], zoom: 14, duration: 600 });
    }
  }, [driver, customer]);

  // ── Route / direct-line drawing ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driver || !customer) {
      onRouteModeChange?.('none');
      // Clear any previous line.
      if (styleLoadedRef.current && map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
      if (styleLoadedRef.current && map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      lastRouteKeyRef.current = null;
      return;
    }
    const key = `${driver.lat.toFixed(4)},${driver.lng.toFixed(4)}|${customer.lat.toFixed(4)},${customer.lng.toFixed(4)}|${enableRouting}`;
    if (key === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = key;

    let cancelled = false;

    const drawGeoJson = (
      coords: [number, number][],
      mode: TrackingRouteMode,
      dashed: boolean,
    ) => {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      };
      const apply = () => {
        if (!mapRef.current) return;
        const m = mapRef.current;
        const existing = m.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(geojson);
          if (m.getLayer(ROUTE_LAYER)) {
            m.setPaintProperty(
              ROUTE_LAYER,
              'line-dasharray',
              dashed ? [1.5, 1.5] : [1, 0],
            );
          }
        } else {
          m.addSource(ROUTE_SOURCE, { type: 'geojson', data: geojson });
          m.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#F97316',
              'line-width': 4,
              'line-opacity': 0.85,
              'line-dasharray': dashed ? [1.5, 1.5] : [1, 0],
            },
          });
        }
        onRouteModeChange?.(mode);
      };
      if (styleLoadedRef.current) apply();
      else map.once('load', apply);
    };

    const fallbackDirect = () =>
      drawGeoJson(
        [
          [driver.lng, driver.lat],
          [customer.lng, customer.lat],
        ],
        'direct',
        true,
      );

    if (!enableRouting || !mapboxgl.accessToken) {
      fallbackDirect();
      return;
    }

    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${driver.lng},${driver.lat};${customer.lng},${customer.lat}` +
      `?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('directions'))))
      .then((json) => {
        if (cancelled) return;
        const coords: [number, number][] | undefined =
          json?.routes?.[0]?.geometry?.coordinates;
        if (!coords || coords.length < 2) {
          fallbackDirect();
          return;
        }
        drawGeoJson(coords, 'route', false);
      })
      .catch(() => {
        if (!cancelled) fallbackDirect();
      });

    return () => {
      cancelled = true;
    };
  }, [driver, customer, enableRouting, onRouteModeChange]);

  if (error) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-zinc-900 text-sm text-zinc-300 ${className ?? ''}`}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!driver && !customer && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/40 text-sm text-zinc-300">
          Loading live map...
        </div>
      )}
      {!driver && customer && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-zinc-900/85 px-2.5 py-1 text-[11px] font-medium text-zinc-200">
          Driver location is not available yet.
        </div>
      )}
    </div>
  );
}
