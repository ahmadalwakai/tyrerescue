import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { adminChatSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSettingsSchema = z.object({
  dailyAskEnabled: z.boolean().optional(),
  dailyAskTime: z.string().nullable().optional(),
  voiceInputEnabled: z.boolean().optional(),
  voiceOutputEnabled: z.boolean().optional(),
  autoOpenEnabled: z.boolean().optional(),
});

/**
 * GET /api/admin/chat/settings
 * Retrieve current admin's chatbot settings.
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [settings] = await db
    .select()
    .from(adminChatSettings)
    .where(eq(adminChatSettings.userId, session.user.id))
    .limit(1);

  if (!settings) {
    // Return defaults
    return NextResponse.json({
      dailyAskEnabled: true,
      dailyAskTime: null,
      voiceInputEnabled: false,
      voiceOutputEnabled: false,
      autoOpenEnabled: true,
    });
  }

  return NextResponse.json({
    dailyAskEnabled: settings.dailyAskEnabled,
    dailyAskTime: settings.dailyAskTime,
    voiceInputEnabled: settings.voiceInputEnabled,
    voiceOutputEnabled: settings.voiceOutputEnabled,
    autoOpenEnabled: settings.autoOpenEnabled,
  });
}

/**
 * PATCH /api/admin/chat/settings
 * Update current admin's chatbot settings.
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = session.user.id;

  // Upsert
  const [existing] = await db
    .select({ id: adminChatSettings.id })
    .from(adminChatSettings)
    .where(eq(adminChatSettings.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(adminChatSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(adminChatSettings.userId, userId));
  } else {
    await db.insert(adminChatSettings).values({ userId, ...parsed.data });
  }

  return NextResponse.json({ success: true });
}
