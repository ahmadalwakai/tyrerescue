import { NextResponse } from 'next/server';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { buildVirtualLandlinePreviewPayload, readVirtualLandlineCsvFromRequest } from '../_lib';

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const result = await readVirtualLandlineCsvFromRequest(request);
  if (!result.ok) return result.response;

  return NextResponse.json(buildVirtualLandlinePreviewPayload(result));
}
