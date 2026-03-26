import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { createAdminNotification } from '@/lib/notifications';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(20),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, phone, notes } = parsed.data;

  const [created] = await db
    .insert(callMeBack)
    .values({ name, phone, notes: notes || null })
    .returning({ id: callMeBack.id });

  if (!created) {
    return NextResponse.json({ error: 'Failed to create callback request' }, { status: 500 });
  }

  // Admin notification (fire-and-forget)
  createAdminNotification({
    type: 'callback.created',
    title: 'Callback Request',
    body: `${name} — ${phone}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
    entityType: 'callback',
    entityId: created.id,
    link: '/admin/callbacks',
    severity: 'warning',
    createdBy: 'system',
    metadata: {
      callbackName: name,
      callbackPhone: phone,
      callbackNotes: notes || undefined,
      important: true,
      updateType: 'created',
      adminPath: '/admin/callbacks',
    },
  }).catch(console.error);

  return NextResponse.json({ success: true }, { status: 201 });
}
