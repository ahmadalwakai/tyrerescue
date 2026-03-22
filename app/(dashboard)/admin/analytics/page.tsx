import { db, bookings, payments, users } from '@/lib/db';
import { sql, eq, gte, desc, isNotNull, and } from 'drizzle-orm';
import { Box, Heading, Text, VStack, SimpleGrid, Table, Badge, HStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InventoryForecast } from './InventoryForecast';

export default async function AdminAnalyticsPage() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalBookingsResult,
    recentBookingsResult,
    revenueResult,
    totalCustomersResult,
    statusBreakdown,
    utmSources,
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
    // UTM source breakdown
    db
      .select({
        source: sql<string>`coalesce(${bookings.utmSource}, 'Direct / Unknown')`,
        medium: sql<string>`coalesce(${bookings.utmMedium}, '-')`,
        count: sql<number>`count(*)`,
        revenue: sql<string>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`,
        hasGclid: sql<number>`count(case when ${bookings.gclid} is not null then 1 end)`,
      })
      .from(bookings)
      .groupBy(sql`coalesce(${bookings.utmSource}, 'Direct / Unknown')`, sql`coalesce(${bookings.utmMedium}, '-')`)
      .orderBy(desc(sql`count(*)`))
      .limit(15),
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

      {/* Customer Sources */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
          <Text color={c.text} fontWeight="600">Customer Sources (All Time)</Text>
          <Text color={c.muted} fontSize="sm">Where your bookings come from — powered by UTM tracking</Text>
        </Box>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Source</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Medium</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Bookings</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Revenue</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Google Ads</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {utmSources.map((row, i) => (
              <Table.Row key={i} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.text} fontWeight="500">{row.source}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.muted}>{row.medium}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.accent} fontWeight="600">{row.count}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>£{Number(row.revenue).toFixed(2)}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  {Number(row.hasGclid) > 0 && <Badge colorPalette="green" size="sm">{row.hasGclid} clicks</Badge>}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <InventoryForecast />
    </VStack>
  );
}
