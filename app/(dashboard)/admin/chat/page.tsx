import { Heading, Box } from '@chakra-ui/react';
import { ChatConversationsClient } from './ChatConversationsClient';

export default function AdminChatPage() {
  return (
    <Box>
      <Heading size="lg" mb={6}>
        Chat Conversations
      </Heading>
      <ChatConversationsClient />
    </Box>
  );
}
