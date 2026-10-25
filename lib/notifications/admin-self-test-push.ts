import 'server-only';

export type AdminTestPushOutcome = 'accepted' | 'rejected' | 'unavailable';

/** Test messages are sent only after the route resolves a device-bound token. */
export async function sendAdminSelfTestPush(token: string): Promise<AdminTestPushOutcome> {
  if (!/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token)) return 'unavailable';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        to: token,
        title: 'Assisted Chat notification test',
        body: 'This is the test notification you requested from your account settings.',
        data: { type: 'admin_notification_test' },
        sound: 'default',
        channelId: 'admin_bookings',
        priority: 'high',
        ttl: 60,
      }]),
      signal: controller.signal,
    });
    if (!response.ok) return 'unavailable';
    const payload: unknown = await response.json();
    const tickets = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { data?: unknown }).data : undefined;
    if (!Array.isArray(tickets) || tickets.length !== 1) return 'unavailable';
    const ticket: unknown = tickets[0];
    if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) return 'unavailable';
    const status = (ticket as { status?: unknown }).status;
    // Relay acceptance is deliberately not described as delivery to the phone.
    return status === 'ok' ? 'accepted' : status === 'error' ? 'rejected' : 'unavailable';
  } catch {
    // Transport/provider errors may echo device tokens. Never log their text.
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
