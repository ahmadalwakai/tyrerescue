type LocationSample = { lat: string | number | null | undefined; lng: string | number | null | undefined; updatedAt: Date | null | undefined };

export function latestDriverLocation(samples: LocationSample[], now = Date.now()) {
  return samples.map((sample) => {
    if (sample.lat == null || sample.lng == null || sample.lat === '' || sample.lng === '' || !sample.updatedAt) return null;
    const lat = Number(sample.lat);
    const lng = Number(sample.lng);
    const timestamp = sample.updatedAt.getTime();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      !Number.isFinite(timestamp) || timestamp > now + 30_000) return null;
    return { lat, lng, updatedAt: sample.updatedAt };
  }).filter((sample) => sample !== null).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
}
