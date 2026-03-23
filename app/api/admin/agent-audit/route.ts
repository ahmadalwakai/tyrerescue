import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAgentAuditLog } from '@/lib/ai/admin-agent/audit';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = await getAgentAuditLog(session.user.id, 30);
  return NextResponse.json({ entries });
}
