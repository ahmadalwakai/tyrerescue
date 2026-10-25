import Image from 'next/image';

export function MapboxCoverage({ token }: { token?: string }) {
  const center = '-4.2518,55.8642';
  const coverage = {
    type: 'Feature',
    properties: {
      stroke: '#f97316',
      'stroke-width': 4,
      'stroke-opacity': 0.85,
      fill: '#f97316',
      'fill-opacity': 0.16,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-4.8518, 55.8642],
          [-4.6754, 56.0763],
          [-4.2518, 56.1642],
          [-3.8282, 56.0763],
          [-3.6518, 55.8642],
          [-3.8282, 55.6521],
          [-4.2518, 55.5642],
          [-4.6754, 55.6521],
          [-4.8518, 55.8642],
        ],
      ],
    },
  };
  const overlay = `geojson(${encodeURIComponent(JSON.stringify(coverage))})`;
  const marker = 'pin-l+f97316(-4.2206,55.8547)';
  const imageUrl = token
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay},${marker}/${center},9,0/1120x520@2x?access_token=${token}`
    : null;

  return (
    <div className="map-card">
      {imageUrl ? (
        <Image
          className="map-image"
          src={imageUrl}
          alt="Mapbox coverage map for 247 Mo Glasgow"
          width={1120}
          height={520}
          sizes="(max-width: 720px) 100vw, 1120px"
        />
      ) : (
        <div className="map-fallback">
          <p>Glasgow coverage radius</p>
          <span>G1-G78 · 30 mile service area</span>
        </div>
      )}
    </div>
  );
}
