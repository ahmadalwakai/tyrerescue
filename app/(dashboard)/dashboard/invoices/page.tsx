import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { Box, Heading, Text, VStack, Table } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function InvoicesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const paidBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, session.user.id))
    .orderBy(desc(bookings.createdAt));

  const invoiceable = paidBookings.filter((b) =>
    ['paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'].includes(b.status),
  );

  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>Invoices</Heading>
        <Text color={c.muted} mt={1}>Download VAT invoices for your completed bookings</Text>
      </Box>

      {invoiceable.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>No invoices available yet.</Text>
        </Box>
      ) : (
        <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Ref</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Date</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Total</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} borderColor={c.border}>Download</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invoiceable.map((booking) => (
                <Table.Row key={booking.id} _hover={{ bg: c.surface }}>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text} fontWeight="500">{booking.refNumber}</Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.muted}>
                      {new Date(booking.createdAt!).toLocaleDateString('en-GB')}
                    </Text>
                  </Table.Cell>
                  <Table.Cell borderColor={c.border}>
                    <Text fontSize="sm" color={c.text}>
                      {'\u00A3'}{Number(booking.totalAmount).toFixed(2)}
                    </Text>
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
      )}
    </VStack>
  );
}
