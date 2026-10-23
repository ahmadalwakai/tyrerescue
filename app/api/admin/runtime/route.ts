import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Build configuration alone cannot establish the managed function's patch version.
export async function GET() {
  const session = await auth();
  const headers = { 'Cache-Control': 'private, no-store' };

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  return NextResponse.json({ node: process.version }, { headers });
}
