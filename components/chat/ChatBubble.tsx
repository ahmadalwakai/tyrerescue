'use client';

import { Box, Text, Image } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type { MessageView } from '@/lib/chat/types';

interface Props {
  message: MessageView;
  isOwn: boolean;
  showSenderName: boolean;
}

export function ChatBubble({ message, isOwn, showSenderName }: Props) {
  const isNote = message.messageType === 'admin_note';
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const roleBadgeColor =
    message.senderRole === 'admin' ? c.accent
    : message.senderRole === 'driver' ? '#3B82F6'
    : '#22C55E';

  return (
    <Box
      maxW="80%"
      alignSelf={isOwn ? 'flex-end' : 'flex-start'}
      mb={2}
    >
      {/* Sender label */}
      {showSenderName && !isOwn && (
        <Text fontSize="11px" color={roleBadgeColor} fontWeight="600" mb="2px" px={1}>
          {message.senderName}
          {isNote && (
            <Box as="span" ml={1} fontSize="10px" color={c.muted} fontStyle="italic">
              (internal note)
            </Box>
          )}
        </Text>
      )}

      {/* Bubble */}
      <Box
        bg={
          isNote ? 'rgba(249,115,22,0.08)'
          : isOwn ? 'rgba(249,115,22,0.15)'
          : c.surface
        }
        borderWidth="1px"
        borderColor={
          isNote ? 'rgba(249,115,22,0.25)'
          : isOwn ? 'rgba(249,115,22,0.2)'
          : c.border
        }
        borderRadius={isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px'}
        px={3}
        py={2}
        position="relative"
      >
        {isNote && isOwn && (
          <Text fontSize="10px" color={c.accent} fontWeight="600" mb={1} fontStyle="italic">
            Internal note
          </Text>
        )}

        {/* Attachments */}
        {message.attachments.map((att) => (
          <Box key={att.id} mb={message.body ? 2 : 0}>
            {att.deleted ? (
              <Text fontSize="12px" color={c.muted} fontStyle="italic">
                Attachment removed
              </Text>
            ) : att.mimeType.startsWith('image/') ? (
              <Image
                src={att.url}
                alt={att.fileName ?? 'Image'}
                maxH="200px"
                maxW="100%"
                borderRadius="8px"
                cursor="pointer"
                onClick={() => window.open(att.url, '_blank', 'noopener')}
              />
            ) : (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: c.accent, fontSize: 13, textDecoration: 'underline' }}
              >
                {att.fileName ?? 'Download attachment'}
              </a>
            )}
          </Box>
        ))}

        {/* Body text */}
        {message.body && (
          <Text fontSize="13px" color={c.text} whiteSpace="pre-wrap" lineHeight="1.5">
            {message.body}
          </Text>
        )}

        {/* Timestamp + delivery status */}
        <Box display="flex" justifyContent={isOwn ? 'flex-end' : 'flex-start'} gap={1} mt={1}>
          <Text fontSize="10px" color={c.muted}>
            {time}
          </Text>
          {isOwn && message.deliveryStatus === 'failed' && (
            <Text fontSize="10px" color="#EF4444">✗</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
