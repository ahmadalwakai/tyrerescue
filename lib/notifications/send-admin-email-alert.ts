import { Resend } from 'resend';
import type {
  AdminNotificationMetadata,
  CreateNotificationInput,
  NotificationType,
} from './types';
import {
  buildAdminAlertEmailTemplate,
  type AdminAlertTemplateField,
} from './admin-email-templates';

type EmailEventCategory =
  | 'Emergency Call Out'
  | 'Fitting Schedule'
  | 'Booking'
  | 'Call Back'
  | 'Chat';

type EventAction = 'created' | 'updated' | 'cancelled';

interface SendAdminEmailAlertInput {
  notificationId: string;
  createdAtIso: string;
  type: CreateNotificationInput['type'];
  title: string;
  body: string;
  entityType: CreateNotificationInput['entityType'];
  entityId: string;
  link?: string;
  metadata?: CreateNotificationInput['metadata'];
}

const ALERT_PREFIX = '[Tyre Rescue Admin Alert]';
const DEFAULT_TO_EMAIL = 'dukesttyres@gmail.com';
const DEFAULT_APP_URL = 'https://www.tyrerescue.uk';
const meaningfulBookingUpdateKinds = new Set([
  'status_change',
  'driver_assignment',
  'driver_acceptance',
  'driver_progress',
  'refund',
  'admin_update',
]);

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function getBaseAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    DEFAULT_APP_URL;

  return raw.replace(/\/$/, '');
}

function toAbsoluteAdminUrl(pathOrUrl: string | undefined, fallbackPath: string): string {
  const base = getBaseAppUrl();
  const raw = pathOrUrl && pathOrUrl.trim().length > 0 ? pathOrUrl.trim() : fallbackPath;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function isMeaningfulBookingUpdate(input: SendAdminEmailAlertInput): boolean {
  if (input.type !== 'booking.updated') return true;

  const metadata = input.metadata;
  if (!metadata) return false;

  if (metadata.important === true) return true;

  if (
    typeof metadata.statusTo === 'string' &&
    typeof metadata.statusFrom === 'string' &&
    metadata.statusTo !== metadata.statusFrom
  ) {
    return true;
  }

  if (typeof metadata.statusTo === 'string' && metadata.statusTo.length > 0) {
    return true;
  }

  if (
    typeof metadata.updateType === 'string' &&
    meaningfulBookingUpdateKinds.has(metadata.updateType)
  ) {
    return true;
  }

  return false;
}

function shouldSendEmail(input: SendAdminEmailAlertInput): boolean {
  if (
    input.type === 'booking.created' ||
    input.type === 'booking.cancelled' ||
    input.type === 'callback.created' ||
    input.type === 'chat.message.received'
  ) {
    return true;
  }

  if (input.type === 'booking.updated') {
    return isMeaningfulBookingUpdate(input);
  }

  return false;
}

function isEmergencyBooking(metadata?: AdminNotificationMetadata): boolean {
  const bookingType = metadata?.bookingType?.toLowerCase();
  return bookingType === 'emergency';
}

function isScheduledBooking(metadata?: AdminNotificationMetadata): boolean {
  const bookingType = metadata?.bookingType?.toLowerCase();
  return bookingType === 'scheduled' || Boolean(metadata?.scheduledAt);
}

function classifyEvent(input: SendAdminEmailAlertInput): {
  category: EmailEventCategory;
  action: EventAction;
} {
  if (input.type === 'callback.created') {
    return { category: 'Call Back', action: 'created' };
  }

  if (input.type === 'chat.message.received') {
    return { category: 'Chat', action: 'created' };
  }

  if (input.type === 'booking.cancelled') {
    if (isEmergencyBooking(input.metadata)) {
      return { category: 'Emergency Call Out', action: 'cancelled' };
    }

    if (isScheduledBooking(input.metadata)) {
      return { category: 'Fitting Schedule', action: 'cancelled' };
    }

    return { category: 'Booking', action: 'cancelled' };
  }

  if (input.type === 'booking.updated') {
    if (isEmergencyBooking(input.metadata)) {
      return { category: 'Emergency Call Out', action: 'updated' };
    }

    if (isScheduledBooking(input.metadata)) {
      return { category: 'Fitting Schedule', action: 'updated' };
    }

    return { category: 'Booking', action: 'updated' };
  }

  if (isEmergencyBooking(input.metadata)) {
    return { category: 'Emergency Call Out', action: 'created' };
  }

  if (isScheduledBooking(input.metadata)) {
    return { category: 'Fitting Schedule', action: 'created' };
  }

  return { category: 'Booking', action: 'created' };
}

function buildSubject(category: EmailEventCategory, action: EventAction): string {
  if (category === 'Call Back') {
    return `${ALERT_PREFIX} New Callback Request`;
  }

  if (category === 'Chat') {
    return `${ALERT_PREFIX} New Chat Message`;
  }

  if (category === 'Emergency Call Out') {
    if (action === 'updated') return `${ALERT_PREFIX} Emergency Call Out Updated`;
    if (action === 'cancelled') return `${ALERT_PREFIX} Emergency Call Out Cancelled`;
    return `${ALERT_PREFIX} New Emergency Call Out`;
  }

  if (category === 'Fitting Schedule') {
    if (action === 'updated') return `${ALERT_PREFIX} Fitting Schedule Updated`;
    if (action === 'cancelled') return `${ALERT_PREFIX} Fitting Schedule Cancelled`;
    return `${ALERT_PREFIX} New Scheduled Fitting`;
  }

  if (action === 'updated') return `${ALERT_PREFIX} Booking Updated`;
  if (action === 'cancelled') return `${ALERT_PREFIX} Booking Cancelled`;
  return `${ALERT_PREFIX} New Booking`;
}

function formatOccurredAt(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}

function pushField(fields: AdminAlertTemplateField[], label: string, value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  fields.push({ label, value: trimmed });
}

function buildRelatedFields(input: SendAdminEmailAlertInput): AdminAlertTemplateField[] {
  const metadata = input.metadata;
  const fields: AdminAlertTemplateField[] = [];

  fields.push({ label: 'Notification Type', value: input.type });

  pushField(fields, 'Booking Ref', metadata?.refNumber);
  pushField(fields, 'Customer Name', metadata?.customerName);
  pushField(fields, 'Customer Phone', metadata?.customerPhone);
  pushField(fields, 'Booking Type', metadata?.bookingType);
  pushField(fields, 'Service Type', metadata?.serviceType);
  pushField(fields, 'Scheduled For', metadata?.scheduledAt ?? undefined);

  pushField(fields, 'Status From', metadata?.statusFrom);
  pushField(fields, 'Status To', metadata?.statusTo);
  pushField(fields, 'Update Kind', metadata?.updateType);
  pushField(fields, 'Driver', metadata?.driverName);
  pushField(fields, 'Reason', metadata?.reason);

  pushField(fields, 'Callback Name', metadata?.callbackName);
  pushField(fields, 'Callback Phone', metadata?.callbackPhone);

  pushField(fields, 'Chat Sender', metadata?.chatSenderRole);
  pushField(fields, 'Chat Preview', metadata?.chatPreview);

  if (fields.length < 2) {
    fields.push({ label: 'Entity', value: `${input.entityType} (${input.entityId})` });
  }

  return fields;
}

function buildFallbackPath(input: SendAdminEmailAlertInput): string {
  const metadata = input.metadata;

  if (typeof metadata?.adminPath === 'string' && metadata.adminPath.trim().length > 0) {
    return metadata.adminPath;
  }

  if (input.entityType === 'callback') return '/admin/callbacks';

  if (input.entityType === 'chat') {
    if (typeof metadata?.refNumber === 'string' && metadata.refNumber.trim().length > 0) {
      return `/admin/bookings/${metadata.refNumber}`;
    }
    return '/admin/chat';
  }

  if (input.entityType === 'booking') {
    if (typeof metadata?.refNumber === 'string' && metadata.refNumber.trim().length > 0) {
      return `/admin/bookings/${metadata.refNumber}`;
    }
    return '/admin/bookings';
  }

  return '/admin';
}

function buildHeading(category: EmailEventCategory, action: EventAction): string {
  if (action === 'updated') return `${category} Updated`;
  if (action === 'cancelled') return `${category} Cancelled`;
  return `New ${category}`;
}

function buildActionSummary(input: SendAdminEmailAlertInput): string {
  const metadata = input.metadata;

  if (typeof metadata?.refNumber === 'string' && metadata.refNumber.trim().length > 0) {
    return `${input.title} (${metadata.refNumber})`;
  }

  return input.title || input.body;
}

export async function sendAdminEmailAlert(input: SendAdminEmailAlertInput): Promise<void> {
  try {
    if (!shouldSendEmail(input)) return;

    const client = getResendClient();
    if (!client) {
      console.warn('[AdminEmailAlert] Skipped: RESEND_API_KEY is not configured');
      return;
    }

    const categoryInfo = classifyEvent(input);
    const subject = buildSubject(categoryInfo.category, categoryInfo.action);
    const actionSummary = buildActionSummary(input);
    const fallbackPath = buildFallbackPath(input);
    const adminUrl = toAbsoluteAdminUrl(input.link, fallbackPath);

    const template = buildAdminAlertEmailTemplate({
      heading: buildHeading(categoryInfo.category, categoryInfo.action),
      eventType: input.type,
      actionSummary,
      occurredAt: formatOccurredAt(input.createdAtIso),
      related: buildRelatedFields(input),
      ctaLabel: 'Open in Admin',
      ctaUrl: adminUrl,
    });

    const toEmail = process.env.ADMIN_ALERT_TO_EMAIL || DEFAULT_TO_EMAIL;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'support@tyrerescue.uk';

    const result = await client.emails.send({
      from: `Tyre Rescue <${fromEmail}>`,
      to: toEmail,
      subject,
      html: template.html,
      text: template.text,
      headers: {
        'X-Admin-Notification-Id': input.notificationId,
        'X-Admin-Notification-Type': input.type as NotificationType,
      },
    });

    if (result.error) {
      console.error('[AdminEmailAlert] Resend error:', result.error.message, {
        notificationId: input.notificationId,
        eventType: input.type,
      });
    }
  } catch (error) {
    console.error('[AdminEmailAlert] Failed to send admin alert email:', error);
  }
}
