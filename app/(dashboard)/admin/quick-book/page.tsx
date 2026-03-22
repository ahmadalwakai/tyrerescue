import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Text } from '@chakra-ui/react';
import { QuickBookForm } from '@/components/admin/quick-book/QuickBookForm';

export default async function AdminQuickBookPage() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <Box maxW="700px" mx="auto">
      <Text
        fontSize="28px"
        color="#FAFAFA"
        mb={6}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        QUICK BOOK
      </Text>
      <QuickBookForm />
    </Box>
  );
}
