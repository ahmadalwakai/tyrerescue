import { NextResponse } from 'next/server';
import { PROJECT_SOURCES } from '@/lib/integrations/project-sources';

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function originVariants(origin: string): string[] {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return [];

  const url = new URL(normalized);
  const host = url.hostname;
  const alternateHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const alternate = `${url.protocol}//${alternateHost}${url.port ? `:${url.port}` : ''}`;
  return [normalized, alternate];
}

const ALLOWED_PROJECT_ORIGINS = new Set(
  PROJECT_SOURCES.flatMap((source) => originVariants(source.origin)),
);

function isLocalNetworkHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

  const match = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && isLocalNetworkHostname(url.hostname);
  } catch {
    return false;
  }
}

export function getVisitorTrackingCorsOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  if (ALLOWED_PROJECT_ORIGINS.has(normalized) || isLocalDevOrigin(normalized)) return normalized;
  return null;
}

export function withVisitorTrackingCors(request: Request, response: NextResponse): NextResponse {
  const origin = getVisitorTrackingCorsOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'false');
  }
  response.headers.append('Vary', 'Origin');
  return response;
}

export function visitorTrackingJson(
  request: Request,
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  return withVisitorTrackingCors(request, NextResponse.json(body, init));
}

export function visitorTrackingOptions(request: Request): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Source-App');
  response.headers.set('Access-Control-Max-Age', '86400');
  return withVisitorTrackingCors(request, response);
}
