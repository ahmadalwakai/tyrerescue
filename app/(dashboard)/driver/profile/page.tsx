import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Box, Heading, VStack, Text } from '@chakra-ui/react';
import { PasswordChangeForm } from './PasswordChangeForm';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function DriverProfilePage() {
  const session = await auth();
  if (!session || session.user.role !== 'driver') {
    redirect('/login');
  }

  // Get user details
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    redirect('/login');
  }

  return (
    <Box>
      <Heading size="lg" mb={6} color={c.text}>
        Profile
      </Heading>

      <VStack align="stretch" gap={6} maxW="600px">
        {/* Account Info (Read Only) */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <Heading size="md" mb={4} color={c.text}>
            Account Information
          </Heading>
          <Text fontSize="sm" color={c.muted} mb={4}>
            Contact your administrator to update this information.
          </Text>
          <VStack align="stretch" gap={4}>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted}>
                Name
              </Text>
              <Text fontSize="lg" color={c.text}>{user.name}</Text>
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted}>
                Email
              </Text>
              <Text fontSize="lg" color={c.text}>{user.email}</Text>
            </Box>
            {user.phone && (
              <Box>
                <Text fontSize="sm" fontWeight="medium" color={c.muted}>
                  Phone
                </Text>
                <Text fontSize="lg" color={c.text}>{user.phone}</Text>
              </Box>
            )}
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted}>
                Member Since
              </Text>
              <Text color={c.text}>
                {user.createdAt?.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </Box>
          </VStack>
        </Box>

        {/* Password Change Form */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <Heading size="md" mb={4}>
            Change Password
          </Heading>
          <PasswordChangeForm />
        </Box>
      </VStack>
    </Box>
  );
}
