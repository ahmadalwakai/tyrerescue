import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Box, Heading, Text, VStack, Table } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const INVOICEABLE = ['paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'];

export default async function InvoicesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const paidBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, session.user.id))
    .orderBy(desc(bookings.createdAt));

  const invoiceable = paidBookings.filter((b) => INVOICEABLE.includes(b.status));

  return (
    <VStack align="stretch" gap={6}>
      <Box style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Heading size="lg" color={c.text}>Invoices</Heading>
        <Text color={c.muted} mt={1}>Download VAT invoices for your completed bookings</Text>
      </Box>

      {invoiceable.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <Text color={c.muted}>No invoices available yet.</Text>
        </Box>
      ) : (
        <>
        {/* Desktop table */}
        <Box display={{ base: 'none', md: 'block' }} bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Booking Ref</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Service</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Date</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Total</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Booking</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Download</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invoiceable.map((booking, i) => (
                <Table.Row key={booking.id} _hover={{ bg: c.surface }} style={{ animation: `fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.1 + i * 0.05, 0.5)}s both` }}>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text} fontWeight="500">{booking.refNumber}</Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text} textTransform="capitalize">{booking.serviceType}</Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.muted}>
                      {new Date(booking.createdAt!).toLocaleDateString('en-GB')}
                    </Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text}>
                      £{Number(booking.totalAmount).toFixed(2)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <NextLink href={`/dashboard/bookings/${booking.refNumber}`} style={{ color: c.accent, textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                      View Booking
                    </NextLink>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <a
                      href={`/api/dashboard/invoices/${booking.refNumber}`}
                      style={{ color: c.accent, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}
                    >
                      Download
                    </a>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        {/* Mobile cards */}
        <VStack display={{ base: 'flex', md: 'none' }} gap={3} align="stretch">
          {invoiceable.map((booking, i) => (
            <Box key={booking.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.05 + i * 0.05, 0.5).toFixed(2)}s both` }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Text color={c.text} fontWeight="600" fontSize="sm">{booking.refNumber}</Text>
                <Text color={c.text} fontWeight="600" fontSize="sm">£{Number(booking.totalAmount).toFixed(2)}</Text>
              </Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Text color={c.muted} fontSize="xs" textTransform="capitalize">{booking.serviceType}</Text>
                <Text color={c.muted} fontSize="xs">
                  {new Date(booking.createdAt!).toLocaleDateString('en-GB')}
                </Text>
              </Box>
              <Box display="flex" gap="8px">
                <NextLink href={`/dashboard/bookings/${booking.refNumber}`} style={{
                  flex: 1, display: 'block', textAlign: 'center', padding: '12px',
                  background: c.surface, color: c.text, borderRadius: 6,
                  fontWeight: 600, textDecoration: 'none', fontSize: 14, minHeight: 48,
                  border: `1px solid ${c.border}`,
                }}>
                  View Booking
                </NextLink>
                <a
                  href={`/api/dashboard/invoices/${booking.refNumber}`}
                  style={{
                    flex: 1, display: 'block', textAlign: 'center', padding: '12px',
                    background: c.accent, color: c.bg, borderRadius: 6,
                    fontWeight: 600, textDecoration: 'none', fontSize: 14, minHeight: 48,
                  }}
                >
                  Download
                </a>
              </Box>
            </Box>
          ))}
        </VStack>
        </>
      )}
    </VStack>
  );
}
