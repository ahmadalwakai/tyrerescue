import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { calculateQuote } from '@/lib/quote';
import type { QuoteResult } from '@/types/vehicle';

export const runtime = 'nodejs';

const tyreSizeSchema = z.object({
  width: z.string().regex(/^\d{3}$/),
  aspect: z.string().regex(/^\d{2,3}$/),
  rim: z.string().regex(/^\d{2}$/),
});

const bodySchema = z.object({
  tyreSize: tyreSizeSchema,
  service: z.enum(['fitting', 'emergency', 'punctureRepair']),
  quantity: z.number().int().min(1).max(4),
});

interface ErrorResponse {
  error: string;
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json<ErrorResponse>(
      { error: parsed.error.issues[0]?.message ?? 'Invalid quote request.' },
      { status: 400 }
    );
  }

  const result: QuoteResult = calculateQuote(parsed.data);
  return NextResponse.json(result, { status: 200 });
}
