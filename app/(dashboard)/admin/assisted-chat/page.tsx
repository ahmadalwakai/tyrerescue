import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Text } from '@chakra-ui/react';
import { AssistedChatPage } from '@/components/admin/assisted-chat/AssistedChatPage';

export default async function AdminAssistedChatPage() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <Box maxW="1200px" mx="auto">
      <Text
        fontSize="28px"
        color="#FAFAFA"
        mb={4}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        ASSISTED CHAT
      </Text>
      <Text fontSize="14px" color="#A1A1AA" mb={6}>
        Build a booking conversationally. Live price, payment choice, and driver dispatch — all reusing the existing booking lifecycle.
      </Text>
      <AssistedChatPage />
    </Box>
  );
}
