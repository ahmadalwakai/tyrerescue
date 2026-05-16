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

function buildMarkerEl(opts: { color: string; ringColor: string; label: string }): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;';
  const pin = document.createElement('div');
  pin.style.cssText = `width:20px;height:20px;border-radius:50%;background:${opts.color};border:3px solid ${opts.ringColor};box-shadow:0 4px 10px rgba(0,0,0,0.45);`;
  const tag = document.createElement('span');
  tag.textContent = opts.label;
  tag.style.cssText =
    'font:600 11px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#FAFAFA;background:rgba(9,9,11,0.85);padding:3px 7px;border-radius:6px;letter-spacing:0.02em;text-transform:uppercase;';
  wrap.appendChild(pin);
  wrap.appendChild(tag);
  return wrap;
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
      return;
    }
    if (!driverMarkerRef.current) {
      const el = buildMarkerEl({ color: '#F97316', ringColor: '#2A0F03', label: driverLabel });
      driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driver.lng, driver.lat]);
    }
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
