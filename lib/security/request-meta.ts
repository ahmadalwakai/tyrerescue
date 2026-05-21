/**
 * Request metadata helpers used by the anti-abuse layer.
 *
 * Never trust a client-supplied IP in the body — always extract from headers.
 */

export function getClientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return normalize(first);
  }
  const real = h.get('x-real-ip');
  if (real) return normalize(real.trim());
  return 'unknown';
}

export function getUserAgent(req: Request): string {
  const ua = req.headers.get('user-agent');
  if (!ua) return 'unknown';
  // Cap UA length for log hygiene.
  return ua.slice(0, 200);
}

function normalize(ip: string): string {
  // Strip surrounding brackets (IPv6) and lower-case for stable keys.
  return ip.replace(/^\[|\]$/g, '').toLowerCase();
}
