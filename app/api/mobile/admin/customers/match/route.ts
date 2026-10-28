import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { findReturningCustomers, isSupportedMatchQuery } from '@/lib/customers/returning-customer';

const querySchema = z.strictObject({
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  tyreSize: z.string().trim().max(30).optional(),
});

function privateResponse(response: Response): Response {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Authorization, Cookie');
  return response;
}

// Read-only candidates for staff confirmation; this never writes or merges data.
export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return privateResponse(unauthorizedResponse());

  const url = new URL(request.url);
  const entries = [...url.searchParams];
  const parsed = querySchema.safeParse(Object.fromEntries(entries));
  if (url.search.length > 2048 || new Set(entries.map(([key]) => key)).size !== entries.length
    || !parsed.success || !isSupportedMatchQuery(parsed.data)) {
    return privateResponse(NextResponse.json({ error: 'A supported phone number or complete address is required.' }, { status: 400 }));
  }

  try {
    const matches = await findReturningCustomers(parsed.data);
    return privateResponse(NextResponse.json({ matches }));
  } catch {
    // Database errors can include query parameters: never log the error object.
    console.error('Returning customer lookup failed');
    return privateResponse(NextResponse.json({ error: 'Could not look up customer history.' }, { status: 500 }));
  }
}
