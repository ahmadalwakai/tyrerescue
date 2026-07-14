import { db, bookings, payments, callMeBack, tyreProducts, drivers, users } from '@/lib/db';
import { sql, eq, gte, and, desc, lte, inArray } from 'drizzle-orm';
import {
  Box,
  Heading,
  Text,
  VStack,
  SimpleGrid,
  Grid,
  GridItem,
  HStack,
  Badge,
  Table,
  Flex,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { getDriverPresenceState, PRESENCE_LABELS, PRESENCE_COLORS } from '@/lib/driver-presence';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  ACTIVE_DRIVER_SITUATION_STATUSES,
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';
import { DriverSituationBadge } from '@/components/admin/DriverSituationBadge';
import Link from 'next/link';

function formatCurrency(val: string | number) {
  return `£${Number(val || 0).toFixed(2)}`;
}

function statusColor(s: string) {
  const map: Record<string, string> = {
    paid: 'green',
    completed: 'green',
    awaiting_payment: 'yellow',
    driver_assigned: 'blue',
    en_route: 'blue',
    arrived: 'blue',
    in_progress: 'purple',
    cancelled: 'red',
    cancelled_refund_pending: 'red',
    refunded: 'gray',
    refunded_partial: 'gray',
  };
  return map[s] || 'gray';
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminDashboardPage() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [
    todayBookings,
    todayRevenue,
    weekRevenue,
    monthRevenue,
    pendingCallbacks,
    recentBookings,
    lowStockItems,
    unassignedBookings,
    driverStatuses,
    activeDriverBookings,
  ] = await Promise.all([
    // Today's bookings count
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(gte(bookings.createdAt, todayStart)),
    // Today's revenue (successful payments)
    db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(payments)
      .where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, todayStart))),
    // Week's revenue
    db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(payments)
      .where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, weekStart))),
    // Month's revenue
    db
      .select({ total: sql<string>`coalesce(sum(amount::numeric), 0)` })
      .from(payments)
      .where(and(eq(payments.status, 'succeeded'), gte(payments.createdAt, monthStart))),
    // Pending callbacks
    db
      .select({ count: sql<number>`count(*)` })
      .from(callMeBack)
      .where(eq(callMeBack.status, 'pending')),
    // Today's bookings list (last 10)
    db
      .select({
        refNumber: bookings.refNumber,
        status: bookings.status,
        customerName: bookings.customerName,
        totalAmount: bookings.totalAmount,
        scheduledAt: bookings.scheduledAt,
        createdAt: bookings.createdAt,
        driverName: users.name,
        driverId: bookings.driverId,
        serviceType: bookings.serviceType,
        quantity: bookings.quantity,
        paymentType: bookings.paymentType,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
        driverLat: drivers.currentLat,
        driverLng: drivers.currentLng,
        driverIsOnline: drivers.isOnline,
        driverStatus: drivers.status,
        driverLocationAt: drivers.locationAt,
      })
      .from(bookings)
      .leftJoin(drivers, eq(bookings.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .where(gte(bookings.createdAt, todayStart))
      .orderBy(desc(bookings.createdAt))
      .limit(10),
    // Low stock items (stock <= 3)
    db
      .select({
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        stockNew: tyreProducts.stockNew,
      })
      .from(tyreProducts)
      .where(and(lte(tyreProducts.stockNew, 3), eq(tyreProducts.availableNew, true)))
      .orderBy(tyreProducts.stockNew)
      .limit(8),
    // Unassigned paid bookings
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'paid'),
          sql`${bookings.driverId} IS NULL`
        )
      ),
    // Driver statuses
    db
      .select({
        id: drivers.id,
        name: users.name,
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id)),
    db
      .select({
        driverId: bookings.driverId,
        refNumber: bookings.refNumber,
        status: bookings.status,
        serviceType: bookings.serviceType,
        quantity: bookings.quantity,
        paymentType: bookings.paymentType,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
      })
      .from(bookings)
      .where(inArray(bookings.status, [...ACTIVE_DRIVER_SITUATION_STATUSES])),
  ]);

  const kpiCards = [
    {
      label: "Today's Bookings",
      value: String(todayBookings[0]?.count || 0),
      href: '/admin/bookings',
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(todayRevenue[0]?.total || 0),
      sub: `Week: ${formatCurrency(weekRevenue[0]?.total || 0)}`,
    },
    {
      label: "Month's Revenue",
      value: formatCurrency(monthRevenue[0]?.total || 0),
    },
    {
      label: 'Pending Callbacks',
      value: String(pendingCallbacks[0]?.count || 0),
      href: '/admin/callbacks',
      alert: (pendingCallbacks[0]?.count || 0) > 0,
    },
  ];

  const unassignedCount = unassignedBookings[0]?.count || 0;
  const activeBookingByDriver = new Map(
    activeDriverBookings
      .filter((booking) => booking.driverId)
      .map((booking) => [booking.driverId!, booking]),
  );

  return (
    <VStack align="stretch" gap={6}>
      {/* Header */}
      <Box>
        <Heading size="lg" color={c.text}>Dashboard</Heading>
        <Text color={c.muted} mt={1}>
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
      </Box>

      {/* KPI Cards */}
      <SimpleGrid columns={{ base: 2, lg: 4 }} gap={4}>
        {kpiCards.map((card) => {
          const inner = (
            <Box
              key={card.label}
              bg={c.card}
              p={5}
              borderRadius="md"
              borderWidth="1px"
              borderColor={card.alert ? 'orange.500' : c.border}
              _hover={card.href ? { borderColor: c.accent } : undefined}
              transition="border-color 0.2s"
            >
              <Text color={c.muted} fontSize="sm">{card.label}</Text>
              <Text color={c.text} fontSize="2xl" fontWeight="700" mt={1}>{card.value}</Text>
              {card.sub && <Text color={c.muted} fontSize="xs" mt={1}>{card.sub}</Text>}
            </Box>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
              {inner}
            </Link>
          ) : (
            <Box key={card.label}>{inner}</Box>
          );
        })}
      </SimpleGrid>

      {/* Alerts */}
      {(unassignedCount > 0 || lowStockItems.length > 0) && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          {unassignedCount > 0 && (
            <Link href="/admin/bookings" style={{ textDecoration: 'none' }}>
              <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor="orange.500">
                <HStack>
                  <Text fontSize="lg">⚠️</Text>
                  <Box>
                    <Text color={c.text} fontWeight="600">
                      {unassignedCount} booking{unassignedCount > 1 ? 's' : ''} need a driver
                    </Text>
                    <Text color={c.muted} fontSize="sm">Paid but no driver assigned</Text>
                  </Box>
                </HStack>
              </Box>
            </Link>
          )}
          {lowStockItems.length > 0 && (
            <Link href="/admin/inventory" style={{ textDecoration: 'none' }}>
              <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor="red.500">
                <HStack>
                  <Text fontSize="lg">📦</Text>
                  <Box>
                    <Text color={c.text} fontWeight="600">
                      {lowStockItems.length} tyre{lowStockItems.length > 1 ? 's' : ''} low on stock
                    </Text>
                    <Text color={c.muted} fontSize="sm">
                      {lowStockItems.filter((i) => (i.stockNew ?? 0) === 0).length} out of stock
                    </Text>
                  </Box>
                </HStack>
              </Box>
            </Link>
          )}
        </SimpleGrid>
      )}

      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
        {/* Today's Bookings Table */}
        <GridItem>
          <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
            <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
              <HStack justifyContent="space-between">
                <Text color={c.text} fontWeight="600">Today&apos;s Bookings</Text>
                <Link href="/admin/bookings">
                  <Text color={c.accent} fontSize="sm" fontWeight="500">View all →</Text>
                </Link>
              </HStack>
            </Box>
            {recentBookings.length === 0 ? (
              <Box p={8} textAlign="center">
                <Text color={c.muted}>No bookings today yet</Text>
              </Box>
            ) : (
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg={c.surface}>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Ref</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Customer</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Driver</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3}>Situation</Table.ColumnHeader>
                    <Table.ColumnHeader color={c.muted} px={4} py={3} textAlign="right">Amount</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {recentBookings.map((b) => (
                    <Table.Row key={b.refNumber} _hover={{ bg: c.surface }}>
                      <Table.Cell px={4} py={3}>
                        <Link href={`/admin/bookings/${b.refNumber}`}>
                          <Text color={c.accent} fontWeight="500" fontSize="sm">{b.refNumber}</Text>
                        </Link>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Text color={c.text} fontSize="sm">{b.customerName}</Text>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Badge colorPalette={statusColor(b.status)} size="sm">
                          {b.status.replace(/_/g, ' ')}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Text color={b.driverName ? c.text : c.muted} fontSize="sm">
                          {b.driverName || 'Unassigned'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <DriverSituationBadge
                          situation={(() => {
                            const customerLat = toNumber(b.customerLat);
                            const customerLng = toNumber(b.customerLng);
                            const driverLat = toNumber(b.driverLat);
                            const driverLng = toNumber(b.driverLng);
                            const outboundMinutes =
                              customerLat != null && customerLng != null && driverLat != null && driverLng != null
                                ? estimateUrbanDriveMinutesFromMiles(
                                    haversineDistanceMiles(
                                      { lat: driverLat, lng: driverLng },
                                      { lat: customerLat, lng: customerLng },
                                    ),
                                  )
                                : null;
                            const returnMinutes =
                              customerLat != null && customerLng != null
                                ? estimateUrbanDriveMinutesFromMiles(
                                    haversineDistanceMiles(
                                      { lat: customerLat, lng: customerLng },
                                      { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
                                    ),
                                  )
                                : null;

                            return calculateDriverSituation({
                              jobRef: b.refNumber,
                              driverId: b.driverId ?? null,
                              bookingStatus: b.status,
                              driverIsOnline: b.driverIsOnline ?? false,
                              driverStatus: b.driverStatus ?? null,
                              lastLocationAt: b.driverLocationAt ?? null,
                              outboundMinutes,
                              returnMinutes,
                              serviceType: b.serviceType,
                              tyreCount: b.quantity,
                              paymentStatus: b.paymentType,
                              returnEstimateAvailable: returnMinutes != null,
                              routeAvailable: outboundMinutes != null,
                              garageConfigured: true,
                            });
                          })()}
                        />
                      </Table.Cell>
                      <Table.Cell px={4} py={3} textAlign="right">
                        <Text color={c.text} fontWeight="500" fontSize="sm">
                          {formatCurrency(b.totalAmount)}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Box>
        </GridItem>

        {/* Sidebar: Drivers + Low Stock */}
        <GridItem>
          <VStack align="stretch" gap={6}>
            {/* Driver Status */}
            <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
              <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
                <Text color={c.text} fontWeight="600">Drivers</Text>
              </Box>
              <VStack align="stretch" gap={0}>
                {driverStatuses.map((d) => {
                  const activeBooking = activeBookingByDriver.get(d.id) ?? null;
                  const customerLat = toNumber(activeBooking?.customerLat);
                  const customerLng = toNumber(activeBooking?.customerLng);
                  const driverLat = toNumber(d.currentLat);
                  const driverLng = toNumber(d.currentLng);
                  const outboundMinutes =
                    activeBooking && customerLat != null && customerLng != null && driverLat != null && driverLng != null
                      ? estimateUrbanDriveMinutesFromMiles(
                          haversineDistanceMiles(
                            { lat: driverLat, lng: driverLng },
                            { lat: customerLat, lng: customerLng },
                          ),
                        )
                      : null;
                  const returnMinutes =
                    activeBooking && customerLat != null && customerLng != null
                      ? estimateUrbanDriveMinutesFromMiles(
                          haversineDistanceMiles(
                            { lat: customerLat, lng: customerLng },
                            { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
                          ),
                        )
                      : null;
                  const situation = activeBooking
                    ? calculateDriverSituation({
                        jobRef: activeBooking.refNumber,
                        driverId: d.id,
                        bookingStatus: activeBooking.status,
                        driverIsOnline: d.isOnline ?? false,
                        driverStatus: d.status,
                        lastLocationAt: d.locationAt,
                        outboundMinutes,
                        returnMinutes,
                        serviceType: activeBooking.serviceType,
                        tyreCount: activeBooking.quantity,
                        paymentStatus: activeBooking.paymentType,
                        returnEstimateAvailable: returnMinutes != null,
                        routeAvailable: outboundMinutes != null,
                        garageConfigured: true,
                      })
                    : null;
                  const presence = getDriverPresenceState(
                    { isOnline: d.isOnline ?? false, locationAt: d.locationAt, status: d.status },
                    activeBooking ? { status: activeBooking.status } : null,
                  );
                  return (
                    <Flex key={d.name} px={4} py={3} borderBottomWidth="1px" borderColor={c.border} justifyContent="space-between" gap={3} align="center">
                      <Box>
                        <Text color={c.text} fontSize="sm">{d.name}</Text>
                        {activeBooking && (
                          <Text color={c.muted} fontSize="xs">#{activeBooking.refNumber}</Text>
                        )}
                      </Box>
                      <VStack align="end" gap={1}>
                        <Badge colorPalette={PRESENCE_COLORS[presence]} size="sm">
                          {PRESENCE_LABELS[presence]}
                        </Badge>
                        {situation && <DriverSituationBadge situation={situation} size="xs" />}
                      </VStack>
                    </Flex>
                  );
                })}
                {driverStatuses.length === 0 && (
                  <Box p={4}>
                    <Text color={c.muted} fontSize="sm">No drivers registered</Text>
                  </Box>
                )}
              </VStack>
            </Box>

            {/* Low Stock */}
            {lowStockItems.length > 0 && (
              <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
                <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
                  <HStack justifyContent="space-between">
                    <Text color={c.text} fontWeight="600">Low Stock</Text>
                    <Link href="/admin/inventory">
                      <Text color={c.accent} fontSize="sm" fontWeight="500">Manage →</Text>
                    </Link>
                  </HStack>
                </Box>
                <VStack align="stretch" gap={0}>
                  {lowStockItems.map((item, i) => (
                    <HStack key={i} px={4} py={3} borderBottomWidth="1px" borderColor={c.border} justifyContent="space-between">
                      <Box>
                        <Text color={c.text} fontSize="sm" fontWeight="500">{item.brand} {item.pattern}</Text>
                        <Text color={c.muted} fontSize="xs">{item.sizeDisplay}</Text>
                      </Box>
                      <Badge colorPalette={(item.stockNew ?? 0) === 0 ? 'red' : 'orange'} size="sm">
                        {item.stockNew ?? 0} left
                      </Badge>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>
        </GridItem>
      </Grid>
    </VStack>
  );
}
