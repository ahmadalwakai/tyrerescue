import { getClientIp, getUserAgent } from './request-meta';

/**
 * Minimal security event logger.
 *
 * Logs ONLY: IP, UA (truncated), route path, method, timestamp, rejection reason,
 * limiter/route key suffix. Never logs request bodies, secrets, payment data,
 * Stripe objects, SMS text or personal customer content.
 */
export function logSecurityRejection(params: {
  req: Request;
  reason: string;
  route: string;
  status: number;
  routeKey?: string;
}): void {
  const { req, reason, route, status, routeKey } = params;
  console.warn('[security] rejection', {
    ts: new Date().toISOString(),
    ip: getClientIp(req),
    ua: getUserAgent(req),
    route,
    method: req.method,
    status,
    reason,
    routeKey,
  });
}
