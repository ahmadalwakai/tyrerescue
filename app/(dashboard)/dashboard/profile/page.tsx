import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Box, Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { ProfileForm } from './ProfileForm';
import { PasswordChangeForm } from './PasswordChangeForm';

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const [user] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) redirect('/login');

  return (
    <VStack align="stretch" gap={8}>
      <Box>
        <Heading size="lg" color={c.text}>Profile</Heading>
        <Text color={c.muted} mt={1}>Manage your account details</Text>
      </Box>

      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text fontWeight="600" color={c.text} mb={4}>Account Information</Text>
        <ProfileForm user={{ name: user.name, email: user.email, phone: user.phone }} />
      </Box>

      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text fontWeight="600" color={c.text} mb={4}>Change Password</Text>
        <PasswordChangeForm />
      </Box>
    </VStack>
  );
}
