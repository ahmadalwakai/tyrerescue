'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Table,
  Flex,
  Input,
  Text,
  Link as ChakraLink,
  HStack,
  VStack,
  Button,
  NativeSelect,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
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
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

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

  return (
    <VStack align="stretch" gap={4}>
      {/* Filter bar */}
      <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s')}>
        <Flex gap={4} wrap="wrap" align="end">
          <Box flex="1" minW="200px">
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Search
            </Text>
            <Input
              placeholder="Ref, name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </Box>
          <Box minW="160px">
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Status
            </Text>
            <NativeSelect.Root>
              <NativeSelect.Field
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
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Date From
            </Text>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </Box>
          <Box minW="150px">
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Date To
            </Text>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </Box>
          <HStack>
            <Button onClick={applyFilters}>Filter</Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* Results count */}
      <Text fontSize="sm" color={c.muted}>
        {totalCount} booking{totalCount !== 1 ? 's' : ''} found
      </Text>

      {/* Table */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={anim.fadeUp('0.5s', '0.1s')}>
        <Table.Root size="md">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Reference</Table.ColumnHeader>
              <Table.ColumnHeader>Customer</Table.ColumnHeader>
              <Table.ColumnHeader>Service</Table.ColumnHeader>
              <Table.ColumnHeader>Type</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Total</Table.ColumnHeader>
              <Table.ColumnHeader>Created</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {bookings.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={7}>
                  <Text textAlign="center" py={8} color={c.muted}>
                    No bookings found
                  </Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              bookings.map((booking, i) => (
                <Table.Row key={booking.id} style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}>
                  <Table.Cell>
                    <ChakraLink asChild fontWeight="medium" color={c.accent}>
                      <NextLink href={`/admin/bookings/${booking.refNumber}`}>
                        {booking.refNumber}
                      </NextLink>
                    </ChakraLink>
                  </Table.Cell>
                  <Table.Cell>{booking.customerName}</Table.Cell>
                  <Table.Cell>
                    {SERVICE_LABELS[booking.serviceType] || booking.serviceType}
                  </Table.Cell>
                  <Table.Cell>
                    <Text textTransform="capitalize">{booking.bookingType}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text
                      fontSize="sm"
                      fontWeight="medium"
                      color={
                        booking.status === 'completed'
                          ? 'green.400'
                          : booking.status === 'cancelled' || booking.status === 'refunded'
                          ? 'red.400'
                          : booking.status === 'en_route' || booking.status === 'in_progress'
                          ? c.accent
                          : c.muted
                      }
                    >
                      {STATUS_LABELS[booking.status] || booking.status}
                    </Text>
                  </Table.Cell>
                  <Table.Cell textAlign="right">
                    {formatCurrency(booking.totalAmount)}
                  </Table.Cell>
                  <Table.Cell>{formatDate(booking.createdAt)}</Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" color={c.muted}>
            Page {currentPage} of {totalPages}
          </Text>
          <HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </HStack>
        </Flex>
      )}
    </VStack>
  );
}
