'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Link as ChakraLink,
  Spinner,
  Table,
  Text,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  lastBookingAt: string | null;
  bookingCount: number;
  paidTotal: string;
}

interface Props {
  customers: Customer[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  search: string;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatCurrency(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

export function CustomersTable({
  customers,
  totalCount,
  currentPage,
  totalPages,
  search,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [searchInput, setSearchInput] = useState(search);
  const [pending, startTransition] = useTransition();

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.push(`/admin/customers${next.toString() ? `?${next}` : ''}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pushParams({ search: searchInput.trim() || null, page: null });
  }

  function clearSearch() {
    setSearchInput('');
    pushParams({ search: null, page: null });
  }

  const goToPage = (p: number) => pushParams({ page: p === 1 ? null : String(p) });

  return (
    <Box>
      <form onSubmit={handleSearchSubmit}>
      <Flex
        gap={3}
        mb={4}
        flexWrap="wrap"
        align="center"
      >
        <Input
          {...inputProps}
          placeholder="Search by name, email or phone"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxW={{ base: '100%', md: '320px' }}
          flex={1}
        />
        <HStack gap={2}>
          <Button
            type="submit"
            bg={c.accent}
            color="#09090B"
            fontWeight="600"
            _hover={{ bg: c.accentHover }}
            disabled={pending}
          >
            {pending ? <Spinner size="sm" /> : 'Search'}
          </Button>
          {search && (
            <Button
              type="button"
              variant="outline"
              borderColor={c.border}
              color={c.muted}
              onClick={clearSearch}
              disabled={pending}
            >
              Clear
            </Button>
          )}
        </HStack>
        <Text fontSize="sm" color={c.muted} ml={{ base: 0, md: 'auto' }}>
          {totalCount} {totalCount === 1 ? 'customer' : 'customers'}
        </Text>
      </Flex>
      </form>

      {customers.length === 0 ? (
        <Box
          bg={c.card}
          borderWidth="1px"
          borderColor={c.border}
          borderRadius="md"
          p={8}
          textAlign="center"
        >
          <Text color={c.text} fontWeight="600" mb={1}>
            No customers found
          </Text>
          <Text color={c.muted} fontSize="sm">
            {search
              ? 'Try a different search term.'
              : 'When customers register an account, they will appear here.'}
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
                <Table.ColumnHeader color={c.muted}>Name</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Email</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Phone</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Verified</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Joined</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} textAlign="right">
                  Bookings
                </Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} textAlign="right">
                  Paid total
                </Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Last booking</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}></Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {customers.map((cu) => (
                <Table.Row key={cu.id}>
                  <Table.Cell color={c.text} fontWeight="500">
                    {cu.name}
                  </Table.Cell>
                  <Table.Cell color={c.text}>{cu.email}</Table.Cell>
                  <Table.Cell color={c.text}>{cu.phone ?? '—'}</Table.Cell>
                  <Table.Cell color={c.muted}>
                    {cu.emailVerified ? 'Yes' : 'No'}
                  </Table.Cell>
                  <Table.Cell color={c.muted}>{formatDate(cu.createdAt)}</Table.Cell>
                  <Table.Cell color={c.text} textAlign="right">
                    {cu.bookingCount}
                  </Table.Cell>
                  <Table.Cell color={c.text} textAlign="right">
                    {formatCurrency(cu.paidTotal)}
                  </Table.Cell>
                  <Table.Cell color={c.muted}>
                    {formatDate(cu.lastBookingAt)}
                  </Table.Cell>
                  <Table.Cell>
                    <ChakraLink
                      asChild
                      color={c.accent}
                      fontWeight="600"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      <NextLink href={`/admin/customers/${cu.id}`}>View</NextLink>
                    </ChakraLink>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {totalPages > 1 && (
        <HStack mt={4} justify="space-between">
          <Text fontSize="sm" color={c.muted}>
            Page {currentPage} of {totalPages}
          </Text>
          <HStack gap={2}>
            <Button
              variant="outline"
              borderColor={c.border}
              color={c.text}
              size="sm"
              disabled={currentPage <= 1 || pending}
              onClick={() => goToPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              borderColor={c.border}
              color={c.text}
              size="sm"
              disabled={currentPage >= totalPages || pending}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
            </Button>
          </HStack>
        </HStack>
      )}
    </Box>
  );
}
