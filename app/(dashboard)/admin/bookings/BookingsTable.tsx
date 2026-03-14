'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  Input,
  Text,
  Link as ChakraLink,
  HStack,
  VStack,
  NativeSelect,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface Booking {
  id: string;
  refNumber: string;
  customerName: string;
  serviceType: string;
  bookingType: string;
  status: string;
  totalAmount: string;
  scheduledAt: string | null;
  createdAt: string | null;
}

interface Props {
  bookings: Booking[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  filters: {
    status: string;
    search: string;
    dateFrom: string;
    dateTo: string;
  };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'en_route', label: 'En Route' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_payment: 'Pending Payment',
  awaiting_payment: 'Awaiting Payment',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(161,161,170,0.15)', color: '#A1A1AA' },
  pending_payment: { bg: 'rgba(234,179,8,0.15)', color: '#EAB308' },
  awaiting_payment: { bg: 'rgba(234,179,8,0.15)', color: '#EAB308' },
  confirmed: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
  assigned: { bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6' },
  en_route: { bg: 'rgba(249,115,22,0.15)', color: '#F97316' },
  arrived: { bg: 'rgba(249,115,22,0.15)', color: '#F97316' },
  in_progress: { bg: 'rgba(249,115,22,0.15)', color: '#F97316' },
  completed: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  refunded: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || { bg: 'rgba(161,161,170,0.15)', color: '#A1A1AA' };
  return (
    <Box
      as="span"
      display="inline-block"
      px="10px"
      py="3px"
      borderRadius="full"
      fontSize="12px"
      fontWeight="600"
      lineHeight="1.4"
      style={{ backgroundColor: colors.bg, color: colors.color }}
    >
      {STATUS_LABELS[status] || status}
    </Box>
  );
}

export function BookingsTable({
  bookings,
  currentPage,
  totalPages,
  totalCount,
  filters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState(filters.status);
  const [search, setSearch] = useState(filters.search);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);

  function applyFilters() {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('page', '1');
    router.push(`/admin/bookings?${params.toString()}`);
  }

  function clearFilters() {
    setStatus('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    router.push('/admin/bookings');
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`/admin/bookings?${params.toString()}`);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatCurrency(amount: string): string {
    return `£${parseFloat(amount).toFixed(2)}`;
  }

  const thStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: c.muted,
    borderBottom: `1px solid ${c.border}`,
    background: c.surface,
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '14px 16px',
    fontSize: '14px',
    color: c.text,
    borderBottom: `1px solid ${c.border}`,
    whiteSpace: 'nowrap',
  };

  return (
    <VStack align="stretch" gap={4}>
      {/* Filter bar */}
      <Box
        bg={c.card}
        p={4}
        borderRadius="lg"
        border={`1px solid ${c.border}`}
        style={anim.fadeUp('0.5s')}
      >
        <VStack gap={3} display={{ base: 'flex', md: 'none' }} align="stretch">
          <Input {...inputProps}
            placeholder="Ref, name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
          <NativeSelect.Root>
            <NativeSelect.Field
              {...selectProps}
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
          <Flex gap={2}>
            <Input {...inputProps} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} flex={1} />
            <Input {...inputProps} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} flex={1} />
          </Flex>
          <Flex gap={2}>
            <Box
              as="button"
              flex={1}
              minH="48px"
              bg={c.accent}
              color="#09090B"
              border="none"
              borderRadius="6px"
              fontSize="14px"
              fontWeight="700"
              cursor="pointer"
              transition="background 0.2s"
              onClick={applyFilters}
            >
              Filter
            </Box>
            <Box
              as="button"
              flex={1}
              minH="48px"
              bg="transparent"
              color={c.muted}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              fontSize="14px"
              fontWeight="500"
              cursor="pointer"
              transition="all 0.2s"
              onClick={clearFilters}
            >
              Clear
            </Box>
          </Flex>
        </VStack>
        <Flex gap={4} wrap="wrap" align="end" display={{ base: 'none', md: 'flex' }}>
          <Box flex="1" minW="200px">
            <Text fontSize="12px" fontWeight="600" mb={1} color={c.muted} letterSpacing="0.03em">
              Search
            </Text>
            <Input {...inputProps}
              placeholder="Ref, name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </Box>
          <Box minW="160px">
            <Text fontSize="12px" fontWeight="600" mb={1} color={c.muted} letterSpacing="0.03em">
              Status
            </Text>
            <NativeSelect.Root>
              <NativeSelect.Field
                {...selectProps}
                value={status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>
          <Box minW="150px">
            <Text fontSize="12px" fontWeight="600" mb={1} color={c.muted} letterSpacing="0.03em">
              Date From
            </Text>
            <Input {...inputProps}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Box>
          <Box minW="150px">
            <Text fontSize="12px" fontWeight="600" mb={1} color={c.muted} letterSpacing="0.03em">
              Date To
            </Text>
            <Input {...inputProps}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </Box>
          <HStack>
            <Box
              as="button"
              h="48px"
              px="24px"
              bg={c.accent}
              color="#09090B"
              border="none"
              borderRadius="6px"
              fontSize="14px"
              fontWeight="700"
              cursor="pointer"
              transition="background 0.2s"
              _hover={{ bg: c.accentHover }}
              onClick={applyFilters}
            >
              Filter
            </Box>
            <Box
              as="button"
              h="48px"
              px="16px"
              bg="transparent"
              color={c.muted}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              fontSize="14px"
              fontWeight="500"
              cursor="pointer"
              transition="all 0.2s"
              _hover={{ borderColor: c.muted, color: c.text }}
              onClick={clearFilters}
            >
              Clear
            </Box>
          </HStack>
        </Flex>
      </Box>

      {/* Results count */}
      <Text fontSize="sm" color={c.muted}>
        {totalCount} booking{totalCount !== 1 ? 's' : ''} found
      </Text>

      {/* Desktop Table */}
      <Box
        bg={c.card}
        borderRadius="lg"
        border={`1px solid ${c.border}`}
        overflowX="auto"
        style={anim.fadeUp('0.5s', '0.1s')}
        display={{ base: 'none', md: 'block' }}
        boxShadow="0 4px 24px rgba(0,0,0,0.3)"
      >
        <Box as="table" w="100%" style={{ borderCollapse: 'collapse' }}>
          <Box as="thead">
            <Box as="tr">
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Reference</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Customer</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Service</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Type</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Status</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'right' }}>Total</Box>
              <Box as="th" style={{ ...thStyle, textAlign: 'left' }}>Created</Box>
            </Box>
          </Box>
          <Box as="tbody">
            {bookings.length === 0 ? (
              <Box as="tr">
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '48px 16px', color: c.muted, borderBottom: 'none' }}>
                  No bookings found
                </td>
              </Box>
            ) : (
              bookings.map((booking, i) => (
                <Box
                  as="tr"
                  key={booking.id}
                  cursor="pointer"
                  transition="background 0.15s"
                  _hover={{ bg: c.surface }}
                  onClick={() => router.push(`/admin/bookings/${booking.refNumber}`)}
                  style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}
                >
                  <Box as="td" style={tdStyle}>
                    <ChakraLink asChild fontWeight="600" color={c.accent} _hover={{ color: c.accentHover }}>
                      <NextLink href={`/admin/bookings/${booking.refNumber}`}>
                        {booking.refNumber}
                      </NextLink>
                    </ChakraLink>
                  </Box>
                  <Box as="td" style={{ ...tdStyle, fontWeight: 500 }}>
                    {booking.customerName}
                  </Box>
                  <Box as="td" style={{ ...tdStyle, color: c.muted, fontSize: '13px' }}>
                    {SERVICE_LABELS[booking.serviceType] || booking.serviceType}
                  </Box>
                  <Box as="td" style={{ ...tdStyle, textTransform: 'capitalize', color: c.muted, fontSize: '13px' }}>
                    {booking.bookingType}
                  </Box>
                  <Box as="td" style={tdStyle}>
                    <StatusBadge status={booking.status} />
                  </Box>
                  <Box as="td" style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-body)', letterSpacing: '-0.01em' }}>
                    {formatCurrency(booking.totalAmount)}
                  </Box>
                  <Box as="td" style={{ ...tdStyle, color: c.muted, fontSize: '13px' }}>
                    {formatDate(booking.createdAt)}
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>

      {/* Mobile Card List */}
      <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
        {bookings.length === 0 ? (
          <Text textAlign="center" py={8} color={c.muted}>
            No bookings found
          </Text>
        ) : (
          bookings.map((booking) => (
            <Box
              key={booking.id}
              asChild
              bg={c.card}
              border={`1px solid ${c.border}`}
              borderRadius="lg"
              p={4}
              cursor="pointer"
              _hover={{ bg: c.surface, borderColor: '#52525B' }}
              transition="all 0.2s"
              boxShadow="0 2px 8px rgba(0,0,0,0.2)"
            >
              <NextLink href={`/admin/bookings/${booking.refNumber}`} style={{ textDecoration: 'none' }}>
                <Flex justify="space-between" align="center" mb={2}>
                  <Text fontWeight="700" color={c.accent} fontSize="sm">
                    {booking.refNumber}
                  </Text>
                  <StatusBadge status={booking.status} />
                </Flex>
                <Flex justify="space-between" mb={1}>
                  <Text fontSize="sm" color={c.text} fontWeight="500">{booking.customerName}</Text>
                  <Text fontSize="12px" color={c.muted}>{formatDate(booking.createdAt)}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontSize="12px" color={c.muted}>
                    {SERVICE_LABELS[booking.serviceType] || booking.serviceType}
                  </Text>
                  <Text fontSize="sm" fontWeight="700" color={c.text}>
                    {formatCurrency(booking.totalAmount)}
                  </Text>
                </Flex>
              </NextLink>
            </Box>
          ))
        )}
      </VStack>

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" color={c.muted}>
            Page {currentPage} of {totalPages}
          </Text>
          <HStack>
            <Box
              as="button"
              h="36px"
              px="16px"
              bg="transparent"
              color={currentPage <= 1 ? '#52525B' : c.text}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              fontSize="13px"
              fontWeight="500"
              cursor={currentPage <= 1 ? 'not-allowed' : 'pointer'}
              transition="all 0.2s"
              onClick={() => currentPage > 1 && goToPage(currentPage - 1)}
              _hover={currentPage > 1 ? { borderColor: c.muted } : {}}
            >
              Previous
            </Box>
            <Box
              as="button"
              h="36px"
              px="16px"
              bg="transparent"
              color={currentPage >= totalPages ? '#52525B' : c.text}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              fontSize="13px"
              fontWeight="500"
              cursor={currentPage >= totalPages ? 'not-allowed' : 'pointer'}
              transition="all 0.2s"
              onClick={() => currentPage < totalPages && goToPage(currentPage + 1)}
              _hover={currentPage < totalPages ? { borderColor: c.muted } : {}}
            >
              Next
            </Box>
          </HStack>
        </Flex>
      )}
    </VStack>
  );
}
