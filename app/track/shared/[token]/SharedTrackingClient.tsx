'use client';

import { useEffect, useState } from 'react';
import { TrackingMap } from '@/components/tracking/TrackingMap';

type SharedState = { status: string; customerLat: number; customerLng: number; driverLat: number | null; driverLng: number | null; driverName: string | null; driverLocationAt: string | null };

export function SharedTrackingClient({ token }: { token: string }) {
  const [data, setData] = useState<SharedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/tracking/shared/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Tracking is temporarily unavailable.');
        if (active) { setData(payload); setError(null); }
      } catch (err) {
        if (active) { setData(null); setError(err instanceof Error ? err.message : 'Unable to refresh tracking.'); }
      } finally { inFlight = false; }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [token]);
  return <main style={{ background: '#09090B', color: '#FAFAFA', minHeight: '100vh', padding: 24, maxWidth: 900, margin: 'auto' }}>
    <h1 style={{ fontSize: 28, fontWeight: 700 }}>Shared journey</h1>
    <p>The customer shared this journey with you. The link expires after 24 hours and can be revoked.</p>
    {error ? <p role="alert">{error}</p> : null}
    {!data && !error ? <p>Loading tracking…</p> : null}
    {data ? <>
      <p style={{ color: '#F97316', marginTop: 20, marginBottom: 20 }}>{data.status.replace(/_/g, ' ')}</p>
      <TrackingMap {...data} showRoute={false} isLocationStale={data.driverLat === null} lastUpdatedLabel={data.driverLocationAt ? `Driver location updated ${new Date(data.driverLocationAt).toLocaleTimeString('en-GB')}` : 'Waiting for driver location'} />
      {data.driverName ? <p>Driver: {data.driverName}</p> : null}
      {data.driverLat === null ? <p>Waiting for a fresh driver location.</p> : null}
    </> : null}
  </main>;
}
