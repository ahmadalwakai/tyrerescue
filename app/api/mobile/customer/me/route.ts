import { NextResponse } from 'next/server';

import {
  getCustomerMobileUser,
  listCustomerMobileBookings,
  unauthorizedResponse,
} from '@/app/api/mobile/customer/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getCustomerMobileUser(request);
  if (!user) return unauthorizedResponse();

  return NextResponse.json({
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
    bookings: await listCustomerMobileBookings(user.id),
  });
}
