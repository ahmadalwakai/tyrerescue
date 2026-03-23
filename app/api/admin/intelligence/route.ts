import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { gatherIntelligence } from '@/lib/ai/admin-agent/intelligence';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const insights = await gatherIntelligence();
  return NextResponse.json({ insights });
}
