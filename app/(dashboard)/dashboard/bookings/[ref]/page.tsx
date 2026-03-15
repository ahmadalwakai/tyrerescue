import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { bookings, bookingTyres, bookingStatusHistory, tyreProducts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Box, Heading, Text, VStack, HStack, SimpleGrid, Flex } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

export default async function CustomerBookingDetailPage(
  props: { params: Promise<{ ref: string }> }
) {
  const session = await auth();
  if (!session) redirect('/login');

  const { ref } = await props.params;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.refNumber, ref), eq(bookings.userId, session.user.id)))
    .limit(1);

  if (!booking) notFound();

  const tyres = await db
    .select({
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
      service: bookingTyres.service,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(eq(bookingTyres.bookingId, booking.id));

  const statusHistory = await db
    .select()
    .from(bookingStatusHistory)
    .where(eq(bookingStatusHistory.bookingId, booking.id))
    .orderBy(desc(bookingStatusHistory.createdAt));

  const showTracking = ['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(booking.status);
  const showInvoice = ['completed', 'paid'].includes(booking.status);
  const canCancel = ['draft', 'awaiting_payment'].includes(booking.status);

  return (
    <VStack align="stretch" gap={6}>
      <HStack justify="space-between" align="start" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Box>
          <Text fontSize="sm" color={c.muted}>Booking Reference</Text>
          <Heading size="lg" color={c.text}>{booking.refNumber}</Heading>
        </Box>
        <Box>
          <Text
            fontSize="sm"
            fontWeight="600"
            px={3}
            py={1}
            borderRadius="md"
            bg="rgba(249,115,22,0.1)"
            color={c.accent}
            textTransform="capitalize"
          >
            {booking.status.replace(/_/g, ' ')}
          </Text>
        </Box>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
        {/* Booking Summary */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <Text fontWeight="600" color={c.text} mb={4}>Booking Details</Text>
          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontSize="sm" color={c.muted}>Type</Text>
              <Text fontSize="sm" color={c.text} textTransform="capitalize">{booking.bookingType}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color={c.muted}>Service</Text>
              <Text fontSize="sm" color={c.text} textTransform="capitalize">{booking.serviceType}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color={c.muted}>Location</Text>
              <Text fontSize="sm" color={c.text} textAlign="right" maxW="200px">{booking.addressLine}</Text>
            </HStack>
            {booking.scheduledAt && (
              <HStack justify="space-between">
                <Text fontSize="sm" color={c.muted}>Scheduled</Text>
                <Text fontSize="sm" color={c.text}>
                  {new Date(booking.scheduledAt).toLocaleString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </HStack>
            )}
            {booking.vehicleReg && (
              <HStack justify="space-between">
                <Text fontSize="sm" color={c.muted}>Vehicle</Text>
                <Text fontSize="sm" color={c.text}>{booking.vehicleReg}</Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Pricing */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}>
          <Text fontWeight="600" color={c.text} mb={4}>Pricing</Text>
          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontSize="sm" color={c.muted}>Subtotal</Text>
              <Text fontSize="sm" color={c.text}>£{Number(booking.subtotal).toFixed(2)}</Text>
            </HStack>
            {Number(booking.vatAmount) > 0 && (
              <HStack justify="space-between">
                <Text fontSize="sm" color={c.muted}>VAT (20%)</Text>
                <Text fontSize="sm" color={c.text}>£{Number(booking.vatAmount).toFixed(2)}</Text>
              </HStack>
            )}
            <Box borderTopWidth="1px" borderColor={c.border} pt={3}>
              <HStack justify="space-between">
                <Text fontWeight="600" color={c.text}>Total</Text>
                <Text fontWeight="700" fontSize="lg" color={c.accent}>£{Number(booking.totalAmount).toFixed(2)}</Text>
              </HStack>
            </Box>
          </VStack>
        </Box>
      </SimpleGrid>

      {/* Tyres */}
      {tyres.length > 0 && (
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}>
          <Text fontWeight="600" color={c.text} mb={4}>Tyres</Text>
          <VStack align="stretch" gap={3}>
            {tyres.map((t, i) => (
              <HStack key={i} justify="space-between" py={2} borderBottomWidth={i < tyres.length - 1 ? '1px' : '0'} borderColor={c.border}>
                <Box>
                  <Text fontSize="sm" color={c.text}>{t.brand} {t.pattern}</Text>
                  <Text fontSize="xs" color={c.muted}>{t.sizeDisplay} / {t.service}</Text>
                </Box>
                <Text fontSize="sm" color={c.text}>{t.quantity}x £{Number(t.unitPrice).toFixed(2)}</Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Status History */}
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.35s both' }}>
        <Text fontWeight="600" color={c.text} mb={4}>Status History</Text>
        <VStack align="stretch" gap={2}>
          {statusHistory.map((sh) => (
            <HStack key={sh.id} justify="space-between" py={2} borderBottomWidth="1px" borderColor={c.border}>
              <Text fontSize="sm" color={c.text} textTransform="capitalize">
                {sh.toStatus.replace(/_/g, ' ')}
              </Text>
              <Text fontSize="xs" color={c.muted}>
                {new Date(sh.createdAt!).toLocaleString('en-GB')}
              </Text>
            </HStack>
          ))}
        </VStack>
      </Box>

      {/* Actions */}
      <Flex gap={3} direction={{ base: 'column', sm: 'row' }} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.4s both' }}>
        {showTracking && (
          <Box asChild>
            <NextLink href={`/tracking/${booking.refNumber}`} style={{
              display: 'inline-block', padding: '12px 24px',
              background: c.accent, color: c.bg, borderRadius: 6,
              fontWeight: 600, textDecoration: 'none', fontSize: 14,
              textAlign: 'center', minHeight: 48,
            }}>
              Track Driver
            </NextLink>
          </Box>
        )}
        {showInvoice && (
          <Box asChild>
            <a href={`/api/dashboard/invoices/${booking.refNumber}`} style={{
              display: 'inline-block', padding: '12px 24px',
              background: c.card, color: c.text, borderRadius: 6,
              fontWeight: 600, textDecoration: 'none', fontSize: 14,
              border: `1px solid ${c.border}`, textAlign: 'center', minHeight: 48,
            }}>
              Download Invoice
            </a>
          </Box>
        )}
        <Box asChild>
          <NextLink href="/dashboard/bookings" style={{
            display: 'inline-block', padding: '12px 24px',
            background: c.card, color: c.text, borderRadius: 6,
            fontWeight: 600, textDecoration: 'none', fontSize: 14,
            border: `1px solid ${c.border}`, textAlign: 'center', minHeight: 48,
          }}>
            Back to Bookings
          </NextLink>
        </Box>
      </Flex>
    </VStack>
  );
}
