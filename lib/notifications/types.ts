// lib/notifications/types.ts

export const NOTIFICATION_TYPES = {
  BOOKING_CREATED: "booking.created",
  BOOKING_UPDATED: "booking.updated",
  BOOKING_CANCELLED: "booking.cancelled",
  CALLBACK_CREATED: "callback.created",
  CHAT_MESSAGE_RECEIVED: "chat.message.received",
  CONTACT_RECEIVED: "contact.received",
  STOCK_LOW: "stock.low",
  INVOICE_CREATED: "invoice.created",
  DRIVER_STATUS_CHANGED: "driver.status.changed",
  AVAILABILITY_UPDATED: "availability.updated",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_FAILED: "payment.failed",
  TESTIMONIAL_SUBMITTED: "testimonial.submitted",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationEntityType =
  | "booking"
  | "callback"
  | "chat"
  | "contact"
  | "stock"
  | "invoice"
  | "driver"
  | "availability"
  | "payment"
  | "testimonial";

export interface AdminNotificationMetadata extends Record<string, unknown> {
  refNumber?: string;
  bookingType?: string;
  serviceType?: string;
  scheduledAt?: string | null;
  customerName?: string;
  customerPhone?: string;
  callbackName?: string;
  callbackPhone?: string;
  callbackNotes?: string;
  chatPreview?: string;
  chatSenderRole?: string;
  statusFrom?: string;
  statusTo?: string;
  driverName?: string;
  updateType?: string;
  reason?: string;
  important?: boolean;
  adminPath?: string;
}

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType;
  entityId: string;
  severity?: NotificationSeverity;
  link?: string;
  metadata?: AdminNotificationMetadata;
  createdBy?: string;
}

export interface AdminNotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  severity: NotificationSeverity;
  link: string | null;
  metadata: AdminNotificationMetadata | null;
  isRead: boolean;
  readAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface AdminNotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  entityType: NotificationEntityType;
  entityId: string;
  link?: string;
  createdAt: string; // ISO string for serialization
  metadata?: AdminNotificationMetadata;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}
