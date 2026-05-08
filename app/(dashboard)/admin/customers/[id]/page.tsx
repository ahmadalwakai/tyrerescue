import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import {
  Box,
  Flex,
  Grid,
  GridItem,
  Heading,
  Link as ChakraLink,
  Text,
  Table,
} from '@chakra-ui/react';
import { and, desc, eq, sql } from 'drizzle-orm';
import { colorTokens as c } from '@/lib/design-tokens';
import { db, users, bookings } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatCurrency(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

export default async function AdminCustomerDetailPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [customer] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, 'customer')))
    .limit(1);

  if (!customer) notFound();

  const [recent, aggregateRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        serviceType: bookings.serviceType,
        bookingType: bookings.bookingType,
        totalAmount: bookings.totalAmount,
        scheduledAt: bookings.scheduledAt,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(eq(bookings.userId, id))
      .orderBy(desc(bookings.createdAt))
      .limit(20),
    db
      .select({
        total: sql<number>`COUNT(*)`,
        paid: sql<string>`COALESCE(SUM(CASE WHEN ${bookings.status} IN ('paid','assigned','accepted','en_route','arrived','in_progress','completed') THEN ${bookings.totalAmount} ELSE 0 END), 0)`,
      })
      .from(bookings)
      .where(eq(bookings.userId, id)),
  ]);

  const totalBookings = Number(aggregateRows[0]?.total ?? 0);
  const paidTotal = String(aggregateRows[0]?.paid ?? '0');

  return (
    <Box>
      <ChakraLink
        asChild
        color={c.muted}
        fontSize="sm"
        _hover={{ color: c.text }}
      >
        <NextLink href="/admin/customers">{'< Back to customers'}</NextLink>
      </ChakraLink>

      <Heading size="lg" mt={3} mb={1}>
        {customer.name}
      </Heading>
      <Text color={c.muted} fontSize="sm" mb={6}>
        Customer account
      </Text>

      <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4} mb={8}>
        <GridItem>
          <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={4}>
            <Heading size="sm" color={c.muted} mb={3}>
              Contact
            </Heading>
            <Flex direction="column" gap={2}>
              <Row label="Email" value={customer.email} />
              <Row label="Phone" value={customer.phone ?? '—'} />
              <Row label="Email verified" value={customer.emailVerified ? 'Yes' : 'No'} />
            </Flex>
          </Box>
        </GridItem>
        <GridItem>
          <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={4}>
            <Heading size="sm" color={c.muted} mb={3}>
              Account
            </Heading>
            <Flex direction="column" gap={2}>
              <Row label="Created" value={formatDate(customer.createdAt)} />
              <Row label="Updated" value={formatDate(customer.updatedAt)} />
              <Row label="Total bookings" value={String(totalBookings)} />
              <Row label="Paid total" value={formatCurrency(paidTotal)} />
            </Flex>
          </Box>
        </GridItem>
      </Grid>

      <Heading size="md" mb={3}>
        Recent bookings
      </Heading>
      {recent.length === 0 ? (
        <Box
          bg={c.card}
          borderWidth="1px"
          borderColor={c.border}
          borderRadius="md"
          p={6}
          textAlign="center"
        >
          <Text color={c.muted} fontSize="sm">
            This customer has no bookings yet.
          </Text>
        </Box>
      ) : (
        <Box
          bg={c.card}
          borderWidth="1px"
          borderColor={c.border}
          borderRadius="md"
          overflowX="auto"
        >
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg={c.surface}>
                <Table.ColumnHeader color={c.muted}>Reference</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Service</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Type</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Status</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Scheduled</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Created</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} textAlign="right">
                  Total
                </Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}></Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {recent.map((b) => (
                <Table.Row key={b.id}>
                  <Table.Cell color={c.text} fontWeight="500">
                    {b.refNumber}
                  </Table.Cell>
                  <Table.Cell color={c.text}>{b.serviceType}</Table.Cell>
                  <Table.Cell color={c.muted}>{b.bookingType}</Table.Cell>
                  <Table.Cell color={c.text}>{b.status}</Table.Cell>
                  <Table.Cell color={c.muted}>{formatDate(b.scheduledAt)}</Table.Cell>
                  <Table.Cell color={c.muted}>{formatDate(b.createdAt)}</Table.Cell>
                  <Table.Cell color={c.text} textAlign="right">
                    {formatCurrency(b.totalAmount)}
                  </Table.Cell>
                  <Table.Cell>
                    <ChakraLink
                      asChild
                      color={c.accent}
                      fontWeight="600"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      <NextLink href={`/admin/bookings?search=${encodeURIComponent(b.refNumber)}`}>
                        Open
                      </NextLink>
                    </ChakraLink>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap={4}>
      <Text fontSize="sm" color={c.muted}>
        {label}
      </Text>
      <Text fontSize="sm" color={c.text} textAlign="right">
        {value}
      </Text>
    </Flex>
  );
}
