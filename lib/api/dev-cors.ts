import { NextResponse } from 'next/server';

const ALLOWED_DEV_ORIGINS = new Set([
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'http://localhost:8083',
  'http://127.0.0.1:8083',
  'http://localhost:8084',
  'http://127.0.0.1:8084',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
]);

function devOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  return origin && ALLOWED_DEV_ORIGINS.has(origin) ? origin : null;
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
