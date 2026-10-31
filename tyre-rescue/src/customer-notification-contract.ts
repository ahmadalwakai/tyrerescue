/** Native categories and payload fields shared with the customer push sender. */
export const CUSTOMER_NOTIFICATION_VERSION = 1;
export const CUSTOMER_NOTIFICATION_SOUND = 'tyre_rescue_chime.wav';
export const CUSTOMER_NOTIFICATION_CHANNEL = 'booking_updates';
export const CUSTOMER_NOTIFICATION_CATEGORIES = [
  { identifier: 'customer_booking_updates', actions: [
    { identifier: 'customer_track', buttonTitle: 'Track rescue', options: { opensAppToForeground: true } },
    { identifier: 'customer_chat', buttonTitle: 'Open chat', options: { opensAppToForeground: true } },
  ] },
  { identifier: 'customer_chat_messages', actions: [
    { identifier: 'customer_chat', buttonTitle: 'Open chat', options: { opensAppToForeground: true } },
  ] },
  { identifier: 'customer_service_complete', actions: [
    { identifier: 'customer_report', buttonTitle: 'Service report', options: { opensAppToForeground: true } },
  ] },
];

type ResponseInput = {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data: Record<string, unknown>; categoryIdentifier?: string | null } } };
};
export type CustomerNotificationTarget = {
  key: string; ref: string; destination: 'track' | 'chat' | 'service-report';
  conversationId?: string; bookingId?: string; recipientCustomerId?: string;
};
const cleanId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : undefined;
const cleanRef = (value: unknown) => typeof value === 'string' && /^(?:TYR|TR)-[A-Z0-9-]{1,48}$/.test(value.trim().toUpperCase()) ? value.trim().toUpperCase() : null;

export function customerNotificationTarget(response: ResponseInput, defaultAction: string): CustomerNotificationTarget | null {
  const request = response?.notification?.request;
  const data = request?.content?.data;
  if (!request || !data || typeof data !== 'object' || !request.identifier || request.identifier.length > 512) return null;
  if (data.notificationVersion !== undefined && data.notificationVersion !== CUSTOMER_NOTIFICATION_VERSION) return null;
  // Payload URLs and credentials are never navigation inputs. Legacy pushes carry ref/refNumber too.
  const ref = cleanRef(data.ref ?? data.refNumber);
  if (!ref) return null;
  const category = request.content.categoryIdentifier;
  const action = response.actionIdentifier;
  if (action !== defaultAction && !CUSTOMER_NOTIFICATION_CATEGORIES.some(item =>
    item.identifier === category && item.actions.some(itemAction => itemAction.identifier === action))) return null;
  const recipientCustomerId = cleanId(data.recipientCustomerId);
  if (data.recipientCustomerId != null && !recipientCustomerId) return null;
  const conversationId = cleanId(data.conversationId);
  const bookingId = cleanId(data.bookingId);
  const destination = action === 'customer_report' || (action === defaultAction && category === 'customer_service_complete')
    ? 'service-report' : action === 'customer_chat' || (action === defaultAction && data.type === 'customer_chat_message') ? 'chat' : 'track';
  return { key: `${request.identifier}:${action}`, ref, destination, recipientCustomerId, conversationId, bookingId };
}

/** An in-memory inbox survives renders, waits for navigation/auth, and consumes each tap once. */
export function createCustomerNotificationInbox() {
  const seen = new Set<string>();
  let pending: { target: CustomerNotificationTarget; scope: number | null } | null = null;
  return {
    offer(target: CustomerNotificationTarget, scope: number | null) {
      if (seen.has(target.key)) return false;
      seen.add(target.key);
      if (seen.size > 100) seen.delete(seen.values().next().value!);
      pending = { target, scope };
      return true;
    },
    take(ready: boolean, scope: number) {
      if (!pending) return null;
      // Initial hydration can replace a saved token's empty snapshot and advance its revision.
      // Unbound cold-start taps still require owner/capability validation before routing.
      if (pending.scope !== null && pending.scope !== scope) { pending = null; return null; }
      if (!ready) return null;
      const target = pending.target;
      pending = null;
      return target;
    },
    clear() { pending = null; },
  };
}

export function customerNotificationHasAccess(target: CustomerNotificationTarget, input: {
  customerId: string | null; bookingRefs: string[]; guestRefs: string[];
}) {
  if (target.recipientCustomerId && target.recipientCustomerId !== input.customerId) return false;
  // A matching recipient is sufficient even if account history has not refreshed yet.
  if (target.recipientCustomerId && target.recipientCustomerId === input.customerId) return true;
  return input.bookingRefs.includes(target.ref) || input.guestRefs.includes(target.ref);
}
