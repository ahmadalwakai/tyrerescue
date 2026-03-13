import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Box, Heading, Text, VStack, Table } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function CustomerBookingsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const userBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, session.user.id))
    .orderBy(desc(bookings.createdAt));

  return (
    <VStack align="stretch" gap={6}>
      <Box style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Heading size="lg" color={c.text}>My Bookings</Heading>
        <Text color={c.muted} mt={1}>View and manage all your tyre service bookings</Text>
      </Box>

      {userBookings.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>You have no bookings yet.</Text>
          <Box mt={4} asChild>
            <NextLink href="/book" style={{
              display: 'inline-block', padding: '10px 24px',
              background: c.accent, color: c.bg, borderRadius: 6,
              fontWeight: 600, textDecoration: 'none', fontSize: 14,
            }}>
              Book Now
            </NextLink>
          </Box>
        </Box>
      ) : (
        <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Ref</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Type</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Status</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Total</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Date</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {userBookings.map((booking, i) => (
                <Table.Row key={booking.id} _hover={{ bg: c.surface }} style={{ animation: `fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.1 + i * 0.05, 0.5)}s both` }}>
                  <Table.Cell borderColor={c.border}>
                    <NextLink href={`/dashboard/bookings/${booking.refNumber}`} style={{ color: c.accent, textDecoration: 'none', fontWeight: 500 }}>
                      {booking.refNumber}
                    </NextLink>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text} textTransform="capitalize">{booking.bookingType}</Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text} textTransform="capitalize">
                      {booking.status.replace(/_/g, ' ')}
                    </Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text}>
                      {'\u00A3'}{Number(booking.totalAmount).toFixed(2)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.muted}>
                      {new Date(booking.createdAt!).toLocaleDateString('en-GB')}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </VStack>
  );
}
