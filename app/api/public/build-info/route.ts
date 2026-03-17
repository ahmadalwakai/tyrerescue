import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    gitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_GIT_SHA ??
      'unknown',
    buildTime: process.env.BUILD_TIME ?? new Date().toISOString(),
  });
}
