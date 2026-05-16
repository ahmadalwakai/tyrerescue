'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface SimpleTrackingMapProps {
  driverLat: number | null;
  driverLng: number | null;
  customerLat?: number | null;
  customerLng?: number | null;
}

/**
 * Slim map used by the public /track/customer and /track/driver pages.
 * Standalone (no Chakra dependency), Mapbox GL JS, dark style. Markers:
 *   - green dot   = customer drop-off
 *   - orange dot  = driver
 * Recenters on driver updates without recreating the map.
 */
export function SimpleTrackingMap({
  driverLat,
  driverLng,
  customerLat,
  customerLng,
}: SimpleTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const customerMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initLat = driverLat ?? customerLat ?? 55.8642; // Glasgow fallback
    const initLng = driverLng ?? customerLng ?? -4.2518;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [initLng, initLat],
      zoom: 13,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      customerMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer marker (green) — set once when coords arrive.
  useEffect(() => {
    if (!mapRef.current || customerLat == null || customerLng == null) return;
    if (customerMarkerRef.current) {
      customerMarkerRef.current.setLngLat([customerLng, customerLat]);
      return;
    }
    const el = document.createElement('div');
    el.style.cssText =
      'width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid #09090B;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
    customerMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([customerLng, customerLat])
      .addTo(mapRef.current);
  }, [customerLat, customerLng]);

  // Driver marker (orange) — updated on each poll without re-creating.
  useEffect(() => {
    if (!mapRef.current) return;
    if (driverLat == null || driverLng == null) {
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      return;
    }
    if (!driverMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:22px;height:22px;border-radius:50%;background:#F97316;border:3px solid #09090B;box-shadow:0 2px 8px rgba(249,115,22,0.6);';
      driverMarkerRef.current = new mapboxgl.Marker(el)
        .setLngLat([driverLng, driverLat])
        .addTo(mapRef.current);
    } else {
      driverMarkerRef.current.setLngLat([driverLng, driverLat]);
    }
    mapRef.current.easeTo({ center: [driverLng, driverLat], duration: 600 });
  }, [driverLat, driverLng]);

  return <div ref={containerRef} className="w-full h-full" />;
}
