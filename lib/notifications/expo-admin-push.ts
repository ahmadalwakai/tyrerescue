import { db } from '@/lib/db';
import { adminPushTokens, bookings } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

interface ExpoPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: 'default' | null;
  channelId?: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Count the number of unassigned paid bookings to use as the badge count.
 */
async function getAdminBadgeCount(): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(bookings)
    .where(eq(bookings.status, 'paid'));
  return result?.value ?? 0;
}

/**
 * Send an Expo push notification to all registered admin push tokens.
 * Fetches badge count automatically unless provided.
 * Never throws — failures are logged but do not propagate.
 */
export async function sendAdminExpoPush(payload: ExpoPushPayload): Promise<void> {
  try {
    const rows = await db.select({ token: adminPushTokens.token }).from(adminPushTokens);
    if (rows.length === 0) return;

    const badge = payload.badge ?? (await getAdminBadgeCount());

    const messages: ExpoPushMessage[] = rows
      .filter((row) => row.token.startsWith('ExponentPushToken['))
      .map((row) => ({
        to: row.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        badge,
        sound: payload.sound ?? 'default',
        channelId: payload.channelId ?? 'admin_bookings',
        priority: 'high',
      }));

    if (messages.length === 0) return;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('[expo-admin-push] HTTP error:', response.status, await response.text());
      return;
    }

    const json = await response.json() as { data: ExpoPushTicket[] };
    const errors = json.data?.filter((t) => t.status === 'error') ?? [];
    if (errors.length > 0) {
      console.error('[expo-admin-push] push errors:', JSON.stringify(errors));
    }
  } catch (err) {
    console.error('[expo-admin-push] unexpected error:', err);
  }
}
