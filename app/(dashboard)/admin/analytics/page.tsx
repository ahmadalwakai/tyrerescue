import { db, bookings, payments, users } from '@/lib/db';
import { sql, eq, gte, desc } from 'drizzle-orm';
import { Box, Heading, Text, VStack, SimpleGrid, Table } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function AdminAnalyticsPage() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalBookingsResult,
    recentBookingsResult,
    revenueResult,
    totalCustomersResult,
    statusBreakdown,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(bookings),
    db.select({ count: sql<number>`count(*)` }).from(bookings).where(gte(bookings.createdAt, thirtyDaysAgo)),
    db.select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` }).from(payments).where(eq(payments.status, 'succeeded')),
    db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, 'customer')),
    db
      .select({ status: bookings.status, count: sql<number>`count(*)` })
      .from(bookings)
      .groupBy(bookings.status)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const stats = [
    { label: 'Total Bookings', value: String(totalBookingsResult[0]?.count || 0) },
    { label: 'Last 30 Days', value: String(recentBookingsResult[0]?.count || 0) },
    { label: 'Total Revenue', value: `£${Number(revenueResult[0]?.total || 0).toFixed(2)}` },
    { label: 'Customers', value: String(totalCustomersResult[0]?.count || 0) },
  ];

  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>Analytics</Heading>
        <Text color={c.muted} mt={1}>Business overview and key metrics</Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
        {stats.map((s) => (
          <Box key={s.label} bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
            <Text color={c.muted} fontSize="sm">{s.label}</Text>
            <Text color={c.text} fontSize="2xl" fontWeight="700" mt={1}>{s.value}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
          <Text color={c.text} fontWeight="600">Bookings by Status</Text>
        </Box>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Count</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {statusBreakdown.map((row) => (
              <Table.Row key={row.status} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.text} textTransform="capitalize">
                  {row.status.replace(/_/g, ' ')}
                </Table.Cell>
                <Table.Cell px={4} py={3} color={c.accent} fontWeight="600">{row.count}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </VStack>
  );
}
