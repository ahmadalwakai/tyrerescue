import { db } from '@/lib/db';
import { adminPushTokens, bookings } from '@/lib/db/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { activeAdminPushSession } from './admin-device-push';

interface ExpoPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string | null;
  channelId?: string;
  ttl?: number;
  platforms?: Array<'android' | 'ios'>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string | null;
  channelId?: string;
  ttl?: number;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/** Expo relay acceptance only; an accepted ticket is not device delivery. */
export interface ExpoPushSendResult {
  accepted: number;
  failed: number;
  /** No eligible devices, transport failure, or an incomplete ticket response. */
  unavailable: boolean;
}

const PUSH_TIMEOUT_MS = 8_000;

/**
 * Count the number of unassigned paid bookings to use as the badge count.
 */
async function getAdminBadgeCount(): Promise<number> {
  try {
    const [result] = await db
      .select({ value: count() })
      .from(bookings)
      .where(eq(bookings.status, 'paid'));
    return result?.value ?? 0;
  } catch {
    // A cosmetic badge count must not prevent a booking alert from being sent.
    console.warn('[expo-admin-push] badge count unavailable');
    return 0;
  }
}

/**
 * Send an Expo push notification to all registered admin push tokens.
 * Fetches badge count automatically unless provided.
 * Never throws — failures are logged but do not propagate.
 */
export async function sendAdminExpoPushWithResult(payload: ExpoPushPayload): Promise<ExpoPushSendResult> {
  let recipients = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await db
      .select({ token: adminPushTokens.token, platform: adminPushTokens.platform })
      .from(adminPushTokens)
      .where(activeAdminPushSession());
    if (rows.length === 0) return { accepted: 0, failed: 0, unavailable: true };

    const badge = payload.badge ?? (await getAdminBadgeCount());

    const messages: ExpoPushMessage[] = rows
      .filter((row) => row.token.startsWith('ExponentPushToken[') || row.token.startsWith('ExpoPushToken['))
      .filter((row) => (
        payload.platforms?.length
          ? payload.platforms.includes(row.platform as 'android' | 'ios')
          : true
      ))
      .map((row) => ({
        to: row.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        badge,
        sound: payload.sound ?? 'default',
        channelId: payload.channelId ?? 'admin_bookings',
        ttl: payload.ttl,
        priority: 'high',
      }));

    recipients = messages.length;
    if (recipients === 0) return { accepted: 0, failed: 0, unavailable: true };

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('[expo-admin-push] relay HTTP error', { status: response.status, messages: messages.length });
      return { accepted: 0, failed: recipients, unavailable: true };
    }

    const json: unknown = await response.json();
    const tickets = json && typeof json === 'object' ? (json as { data?: unknown }).data : undefined;
    if (!Array.isArray(tickets)) {
      console.error('[expo-admin-push] malformed relay ticket response');
      return { accepted: 0, failed: recipients, unavailable: true };
    }
    const validTickets = tickets.slice(0, recipients).filter((ticket): ticket is ExpoPushTicket => (
      Boolean(ticket) && typeof ticket === 'object' && ['ok', 'error'].includes(ticket.status)
    ));
    const unavailable = tickets.length !== recipients || validTickets.length !== recipients;
    if (unavailable) console.error('[expo-admin-push] malformed relay ticket response');
    // Preserve known acceptance even in an incomplete response. A caller must
    // not resend a whole event to phones that already accepted its first send.
    const accepted = validTickets.filter((ticket) => ticket.status === 'ok').length;
    const errors = validTickets.filter((ticket) => ticket.status === 'error');
    if (errors.length > 0) {
      const knownCodes = new Set(['DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidProviderToken']);
      console.error('[expo-admin-push] relay ticket errors', {
        messages: messages.length,
        failed: errors.length,
        errorCodes: [...new Set(errors.map((ticket) => {
          const code = ticket.details?.error;
          return typeof code === 'string' && knownCodes.has(code) ? code : 'UnknownError';
        }))],
      });
    }
    // Expo reports a token the device no longer accepts (app removed or token
    // rotated). Drop exactly those tokens so they stop receiving failed sends;
    // the app registers a fresh token on its next sign-in or launch.
    const staleTokens = tickets.slice(0, recipients).flatMap((ticket, index) => (
      ticket && typeof ticket === 'object' && (ticket as ExpoPushTicket).status === 'error'
        && (ticket as ExpoPushTicket).details?.error === 'DeviceNotRegistered' ? [messages[index].to] : []
    ));
    if (staleTokens.length > 0) {
      try {
        await db.delete(adminPushTokens).where(inArray(adminPushTokens.token, staleTokens));
      } catch {
        console.error('[expo-admin-push] could not remove unregistered tokens');
      }
    }
    return { accepted, failed: recipients - accepted, unavailable };
  } catch {
    console.error('[expo-admin-push] send failed');
    return { accepted: 0, failed: recipients, unavailable: true };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Backward-compatible best-effort sender for callers that do not need counts. */
export async function sendAdminExpoPush(payload: ExpoPushPayload): Promise<void> {
  try {
    await sendAdminExpoPushWithResult(payload);
  } catch {
    console.error('[expo-admin-push] send failed');
  }
}
