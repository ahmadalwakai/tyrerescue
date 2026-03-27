import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';

export async function getMobileAdminUser(request: Request) {
  try {
    const session = await requireAdminMobile(request);
    return session.user;
  } catch {
    return null;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function parsePageParams(url: URL, defaults?: { page?: number; perPage?: number; maxPerPage?: number }) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || String(defaults?.page ?? 1), 10));
  const perPageRaw = Number.parseInt(url.searchParams.get('perPage') || String(defaults?.perPage ?? 25), 10);
  const maxPerPage = defaults?.maxPerPage ?? 100;
  const perPage = Math.max(1, Math.min(maxPerPage, Number.isFinite(perPageRaw) ? perPageRaw : 25));
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}
