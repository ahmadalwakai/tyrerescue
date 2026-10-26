import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { findReturningCustomers } from '@/lib/customers/returning-customer';

const querySchema = z.object({
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  tyreSize: z.string().trim().max(30).optional(),
});

/**
 * GET /api/mobile/admin/customers/match — returning-customer candidates for the
 * operator to confirm. Staff only: the response holds customer history.
 * Matching never writes, merges or links anything.
 */
export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries([...url.searchParams].filter(([, value]) => value !== '')));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid search' }, { status: 400 });
  try {
    const matches = await findReturningCustomers(parsed.data);
    return NextResponse.json({ matches }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Returning customer lookup failed:', error);
    return NextResponse.json({ error: 'Could not look up customer history.' }, { status: 500 });
  }
}
