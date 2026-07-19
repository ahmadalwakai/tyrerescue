import { NextResponse } from 'next/server';

function isExpoDevPort(port: string): boolean {
  const n = Number(port);
  return n === 19006 || (Number.isInteger(n) && n >= 8081 && n <= 8099);
}

export function isLocalNetworkHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

  const match = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

export function isLocalNetworkHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.split(',')[0]?.trim() ?? '';
  if (!host) return false;

  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 0 && isLocalNetworkHostname(host.slice(1, end));
  }

  return isLocalNetworkHostname(host.split(':')[0] ?? host);
}

export function isAllowedExpoDevOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isExpoDevPort(url.port) && isLocalNetworkHostname(url.hostname);
  } catch {
    return false;
  }
}

function devOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  return isAllowedExpoDevOrigin(origin) ? origin : null;
}

export function withExpoDevCors<R extends NextResponse>(request: Request, response: R): R {
  const origin = devOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, x-visit-count');
    response.headers.set('Access-Control-Max-Age', '86400');
    response.headers.append('Vary', 'Origin');
  }
  return response;
}

export function jsonWithExpoDevCors(
  request: Request,
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  return withExpoDevCors(request, NextResponse.json(body, init));
}

export function expoDevCorsPreflight(request: Request): NextResponse {
  return withExpoDevCors(request, new NextResponse(null, { status: 204 }));
}
