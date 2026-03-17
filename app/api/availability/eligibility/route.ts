import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { drivers, users, serviceAreas, pricingRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveDistance } from '@/lib/mapbox';
import { parsePricingRules } from '@/lib/pricing-engine';

/**
 * POST /api/availability/eligibility
 *
 * Location-aware emergency eligibility check.
 * Called after the customer confirms their location during an emergency booking.
 * Returns ETA, nearest driver info, and an eligible boolean.
 * Max distance from pricingRules.max_service_miles (single source of truth).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng } = body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid lat/lng' },
        { status: 400 },
      );
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Load pricing rules, drivers, and service areas in parallel.
    // Explicit column selection for serviceAreas to avoid missing-column crashes.
    const [rulesRows, availableDrivers, areas] = await Promise.all([
      db.select().from(pricingRules),
      db
        .select({
          id: drivers.id,
          name: users.name,
          lat: drivers.currentLat,
          lng: drivers.currentLng,
          locationAt: drivers.locationAt,
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id))
        .where(
          and(
            eq(drivers.isOnline, true),
            eq(drivers.status, 'available'),
          ),
        ),
      db
        .select({
          id: serviceAreas.id,
          lat: serviceAreas.centerLat,
          lng: serviceAreas.centerLng,
        })
        .from(serviceAreas)
        .where(eq(serviceAreas.active, true)),
    ]);

    const parsedRules = parsePricingRules(
      rulesRows.map((r) => ({ key: r.key, value: r.value })),
    );
    const maxServiceMiles = parsedRules.max_service_miles;

    // All online+available drivers count (for the UI "X drivers online" label)
    const onlineDriverCount = availableDrivers.length;

    // Filter to drivers with fresh GPS (used for routing/ETA only)
    const freshDrivers = availableDrivers
      .filter((d) => {
        if (!d.lat || !d.lng) return false;
        if (!d.locationAt) return true;
        return new Date(d.locationAt) > oneHourAgo;
      })
      .map((d) => ({
        id: d.id,
        name: d.name ?? 'Driver',
        lat: Number(d.lat),
        lng: Number(d.lng),
      }));

    const areaCandidates = areas
      .filter((a) => a.lat && a.lng)
      .map((a) => ({
        id: a.id,
        lat: Number(a.lat),
        lng: Number(a.lng),
      }));

    // Resolve distance using the fallback chain
    const result = await resolveDistance(
      { lat, lng },
      freshDrivers.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng })),
      areaCandidates,
    );

    const eligible = result.distanceMiles <= maxServiceMiles;

    // Build ETA range: use driving duration when available, else estimate at 30mph
    const rawEta =
      result.durationMinutes ?? Math.round((result.distanceMiles / 30) * 60);

    // Produce a realistic range — never show misleading single-minute precision
    const etaMinRaw = Math.max(15, Math.round(rawEta * 0.8));
    const etaMaxRaw = Math.round(rawEta * 1.4);
    // Guard: min must never exceed max
    const etaMinMinutes = Math.min(etaMinRaw, etaMaxRaw);
    const etaMaxMinutes = Math.max(etaMinRaw, etaMaxRaw);

    // Human-friendly label
    // For emergency availability the owner-approved label is always "1–2 hours".
    // We never show misleading minute-precision ETA on this card.
    function formatEtaLabel(min: number, max: number): string {
      // Normalise so min <= max
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      if (hi >= 60) {
        const loH = lo / 60;
        const hiH = hi / 60;
        return `${Math.max(1, Math.round(loH))}–${Math.max(Math.ceil(hiH), 2)} hours`;
      }
      // Even for sub-hour, clamp to at least "1–2 hours" for emergency use
      return '1–2 hours';
    }

    const etaLabel = formatEtaLabel(etaMinMinutes, etaMaxMinutes);

    // Find matching driver name if sourced from a driver
    let driverName: string | null = null;
    if (result.selectedDriverId) {
      const match = freshDrivers.find((d) => d.id === result.selectedDriverId);
      if (match) driverName = match.name;
    }

    return NextResponse.json({
      eligible,
      etaMinMinutes,
      etaMaxMinutes,
      etaLabel,
      distanceMiles: result.distanceMiles,
      source: result.distanceSource,
      driverId: result.selectedDriverId,
      driverName,
      driverLat: result.originLat,
      driverLng: result.originLng,
      routeDurationMinutes: result.durationMinutes,
      driversOnline: onlineDriverCount,
      message: eligible
        ? freshDrivers.length > 0
          ? `Nearest driver approximately ${etaLabel} away`
          : `Estimated arrival ${etaLabel} (from service center)`
        : 'This location is outside our emergency service area',
    });
  } catch (error) {
    console.error('Eligibility check error:', error);
    return NextResponse.json(
      { error: 'Failed to check eligibility' },
      { status: 500 },
    );
  }
}
