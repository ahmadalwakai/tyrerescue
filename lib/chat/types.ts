/** Shared types for the booking-bound chat system */

export type ChatChannel = 'customer_admin' | 'customer_driver' | 'admin_driver';
export type ChatRole = 'customer' | 'admin' | 'driver';
export type ConversationStatus = 'open' | 'closed' | 'archived';
export type MessageType = 'text' | 'image' | 'admin_note';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface ConversationSummary {
  id: string;
  bookingId: string;
  bookingRef: string;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
  customerName: string;
  driverName: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageSenderRole: ChatRole | null;
  unreadCount: number;
  createdAt: string;
}

export interface MessageView {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ChatRole;
  body: string | null;
  messageType: MessageType;
  deliveryStatus: DeliveryStatus;
  attachments: AttachmentView[];
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
  bookingId: string;
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
