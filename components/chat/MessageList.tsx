'use client';

import { useEffect, useRef } from 'react';
import { Box, VStack, Text, Spinner, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { ChatBubble } from './ChatBubble';
import type { MessageView } from '@/lib/chat/types';

interface Props {
  messages: MessageView[];
  currentUserId: string;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function MessageList({ messages, currentUserId, isLoading, hasMore, onLoadMore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  return (
    <Box
      ref={containerRef}
      flex="1"
      overflowY="auto"
      px={3}
      py={2}
      css={{
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-thumb': { background: c.border, borderRadius: '2px' },
      }}
    >
      {/* Load more */}
      {hasMore && (
        <Flex justify="center" py={2}>
          <Text
            fontSize="12px"
            color={c.accent}
            cursor="pointer"
            onClick={onLoadMore}
            _hover={{ textDecoration: 'underline' }}
          >
            Load earlier messages
          </Text>
        </Flex>
      )}

      {isLoading && messages.length === 0 && (
        <Flex justify="center" py={6}>
          <Spinner size="sm" color={c.accent} />
        </Flex>
      )}

      {!isLoading && messages.length === 0 && (
        <Flex justify="center" py={6}>
          <Text fontSize="13px" color={c.muted}>
            No messages yet. Start the conversation.
          </Text>
        </Flex>
      )}

      <VStack align="stretch" gap={0}>
        {messages.map((msg, i) => {
          const isOwn = msg.senderId === currentUserId;
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showName = !prevMsg || prevMsg.senderId !== msg.senderId;
          return (
            <ChatBubble
              key={msg.id}
              message={msg}
              isOwn={isOwn}
              showSenderName={showName}
            />
          );
        })}
      </VStack>

      <div ref={bottomRef} />
    </Box>
  );
}
