import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, desc, and, inArray, gte } from 'drizzle-orm';
import { Box, Heading, Text, VStack, HStack, SimpleGrid } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const userBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, session.user.id))
    .orderBy(desc(bookings.createdAt))
    .limit(10);

  const totalBookings = userBookings.length;
  const lastBooking = userBookings[0] || null;

  const now = new Date();
  const upcomingBooking = userBookings.find(
    (b) =>
      b.bookingType === 'scheduled' &&
      b.scheduledAt &&
      new Date(b.scheduledAt) > now &&
      ['paid', 'driver_assigned'].includes(b.status),
  );

  return (
    <VStack align="stretch" gap={8}>
      <Box style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Heading size="lg" color={c.text}>
          Welcome back, {session.user.name}
        </Heading>
        <Text color={c.muted} mt={2}>
          Manage your bookings and account details
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <Text fontSize="sm" color={c.muted}>Total Bookings</Text>
          <Text fontSize="3xl" fontWeight="700" color={c.text} mt={1}>{totalBookings}</Text>
        </Box>

        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}>
          <Text fontSize="sm" color={c.muted}>Last Booking Status</Text>
          <Text fontSize="lg" fontWeight="600" color={c.accent} mt={1} textTransform="capitalize">
            {lastBooking ? lastBooking.status.replace(/_/g, ' ') : 'No bookings yet'}
          </Text>
          {lastBooking && (
            <Text fontSize="xs" color={c.muted} mt={1}>{lastBooking.refNumber}</Text>
          )}
        </Box>

        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}>
          <Text fontSize="sm" color={c.muted}>Upcoming Booking</Text>
          {upcomingBooking ? (
            <>
              <Text fontSize="lg" fontWeight="600" color={c.text} mt={1}>
                {new Date(upcomingBooking.scheduledAt!).toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })}
              </Text>
              <Text fontSize="xs" color={c.muted} mt={1}>{upcomingBooking.refNumber}</Text>
            </>
          ) : (
            <Text fontSize="lg" fontWeight="600" color={c.muted} mt={1}>None scheduled</Text>
          )}
        </Box>
      </SimpleGrid>

      <HStack gap={4}>
        <Box asChild>
          <NextLink href="/dashboard/bookings" style={{
            display: 'inline-block', padding: '10px 24px',
            background: c.accent, color: c.bg, borderRadius: 6,
            fontWeight: 600, textDecoration: 'none', fontSize: 14,
          }}>
            View All Bookings
          </NextLink>
        </Box>
        <Box asChild>
          <NextLink href="/dashboard/profile" style={{
            display: 'inline-block', padding: '10px 24px',
            background: c.card, color: c.text, borderRadius: 6,
            fontWeight: 600, textDecoration: 'none', fontSize: 14,
            border: `1px solid ${c.border}`,
          }}>
            Edit Profile
          </NextLink>
        </Box>
      </HStack>
    </VStack>
  );
}
