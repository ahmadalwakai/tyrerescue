import { withBookingChatTransaction } from './booking-conversation';
import type { ChatRole, MessageType, MessageView } from './types';

export function sendBookingChatMessage(input: {
  conversationId: string; senderId: string | null; senderRole: ChatRole; body: string | null; messageType: MessageType;
  attachment?: { url: string; mimeType: string; fileSize: number; fileName?: string }; messageId?: string;
}): Promise<MessageView> {
  return withBookingChatTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`chat-send:${input.conversationId}`]);
    const inserted = await client.query(`INSERT INTO booking_messages
      (id, conversation_id, sender_id, sender_role, body, message_type, delivery_status)
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, 'sent') RETURNING id, created_at`,
    [input.messageId ?? null, input.conversationId, input.senderId, input.senderRole, input.body, input.messageType]);
    const message = inserted.rows[0];
    if (typeof message?.id !== 'string') throw new Error('Could not save message');
    const attachments: MessageView['attachments'] = [];
    if (input.attachment) {
      const { url, mimeType, fileSize, fileName } = input.attachment;
      const insertedAttachment = await client.query(`INSERT INTO message_attachments (message_id, url, mime_type, file_size, file_name)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`, [message.id, url, mimeType, fileSize, fileName ?? null]);
      const attachmentId = insertedAttachment.rows[0]?.id;
      if (typeof attachmentId !== 'string') throw new Error('Could not save message attachment');
      attachments.push({ id: attachmentId, url, mimeType, fileSize, fileName: fileName ?? null, deleted: false });
    }
    await client.query('UPDATE booking_conversations SET updated_at = NOW() WHERE id = $1', [input.conversationId]);
    // Initialize missing rows before the atomic increment. DISTINCT handles
    // historic duplicate participant rows without counting a message twice.
    const recipientCondition = `p.conversation_id = $1 AND p.user_id IS DISTINCT FROM $2::uuid AND ($3::boolean = false OR u.role = 'admin')`;
    await client.query(`INSERT INTO message_read_state (conversation_id, user_id, unread_count)
      SELECT DISTINCT $1::uuid, p.user_id, 0 FROM conversation_participants p JOIN users u ON u.id = p.user_id
      WHERE ${recipientCondition} AND NOT EXISTS (SELECT 1 FROM message_read_state r WHERE r.conversation_id = $1 AND r.user_id = p.user_id)`,
    [input.conversationId, input.senderId, input.messageType === 'admin_note']);
    await client.query(`UPDATE message_read_state SET unread_count = COALESCE(unread_count, 0) + 1, updated_at = NOW()
      WHERE conversation_id = $1 AND user_id IN (SELECT p.user_id FROM conversation_participants p JOIN users u ON u.id = p.user_id WHERE ${recipientCondition})`,
    [input.conversationId, input.senderId, input.messageType === 'admin_note']);
    const sender = input.senderId ? await client.query('SELECT name FROM users WHERE id = $1', [input.senderId]) : null;
    return { id: message.id, senderId: input.senderId,
      senderName: typeof sender?.rows[0]?.name === 'string' ? sender.rows[0].name : input.senderId === null && input.senderRole === 'customer' ? 'Guest customer' : 'Unknown',
      senderRole: input.senderRole, body: input.body, messageType: input.messageType, deliveryStatus: 'sent', attachments, deleted: false,
      createdAt: new Date(message.created_at as string | Date).toISOString() };
  });
}
