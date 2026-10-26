/** Shared types for booking chats and private staff-to-driver chats. */

export type ChatChannel = 'customer_admin' | 'customer_driver' | 'admin_driver';
export type ChatRole = 'customer' | 'admin' | 'driver';
export type ConversationStatus = 'open' | 'closed' | 'archived';
export type MessageType = 'text' | 'image' | 'audio' | 'admin_note';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface ConversationSummary {
  id: string;
  bookingId: string | null;
  scope: 'booking' | 'direct_driver';
  bookingRef: string;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
  customerName: string;
  driverId: string | null;
  driverName: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageSenderRole: ChatRole | null;
  unreadCount: number;
  createdAt: string;
  /** Newest visible message time, or the conversation's creation time. Drives inbox order. */
  lastActivityAt?: string;
  /** Admin viewers only. */
  customerPhone?: string | null;
  /** Admin viewers only. */
  bookingStatus?: string | null;
}

/** Inbox sections: open customer threads, open driver threads, or closed/archived threads. */
export type InboxBox = 'customers' | 'drivers' | 'closed';

export interface MessageView {
  id: string;
  senderId: string | null;
  senderName: string;
  senderRole: ChatRole;
  body: string | null;
  messageType: MessageType;
  deliveryStatus: DeliveryStatus;
  attachments: AttachmentView[];
  deleted: boolean;
  createdAt: string;
}

export interface AttachmentView {
  id: string;
  url: string;
  mimeType: string;
  fileSize: number;
  fileName: string | null;
  deleted: boolean;
}

export interface ConversationDetail {
  id: string;
  bookingId: string | null;
  scope: 'booking' | 'direct_driver';
  bookingRef: string;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
  participants: { userId: string; name: string; role: ChatRole }[];
}

export interface AdminControlAction {
  lock?: boolean;
  mute?: boolean;
  close?: boolean;
  archive?: boolean;
  reopen?: boolean;
  deleteAttachment?: { messageId: string; attachmentId: string };
}
