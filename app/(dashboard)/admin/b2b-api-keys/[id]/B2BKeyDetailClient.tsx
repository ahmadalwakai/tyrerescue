'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Badge,
  Spinner,
  Code,
  Table,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

// ── Types ──────────────────────────────────────────────

interface KeyDetail {
  id: string;
  keyPrefix: string;
  label: string;
  status: string;
  allowedScopes: string[];
  allowedPlatforms: string[];
  allowedStockFilters: Record<string, unknown> | null;
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

interface ClientDetail {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

interface AuditEntry {
  id: string;
  apiKeyId: string | null;
  action: string;
  route: string | null;
  statusCode: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface DetailData {
  client: ClientDetail;
  keys: KeyDetail[];
  auditLogs: AuditEntry[];
}

const statusBg: Record<string, string> = {
  active: '#14532D',
  suspended: '#713F12',
  revoked: '#7F1D1D',
};
const statusFg: Record<string, string> = {
  active: '#86EFAC',
  suspended: '#FDE68A',
  revoked: '#FCA5A5',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge bg={statusBg[status] ?? '#27272A'} color={statusFg[status] ?? '#A1A1AA'} fontSize="xs">
      {status}
    </Badge>
  );
}

// ── Component ──────────────────────────────────────────

export function B2BKeyDetailClient({ clientId }: { clientId: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/b2b-api-keys/${clientId}`);
      if (!res.ok) throw new Error('Not found');
      const d = await res.json();
      setData(d);
    } catch {
      setError('Failed to load client details.');
    } finally {
      setPageLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function doAction(action: 'suspend' | 'revoke' | 'reactivate') {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/b2b-api-keys/${clientId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? `Failed to ${action}`);
        return;
      }
      await fetchDetail();
    } catch {
      alert(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  if (pageLoading) {
    return (
      <Flex justify="center" py={16}>
        <Spinner color={c.accent} size="lg" />
      </Flex>
    );
  }

  if (error || !data) {
    return (
      <Box p={8}>
        <Box bg={c.card} borderRadius="md" p={4} borderWidth={1} borderColor="red.800">
          <Text color="red.400" fontWeight="medium" mb={1}>Error</Text>
          <Text color={c.muted} fontSize="sm">
            {error ?? 'Client not found.'}{' '}
            <Box
              as="button"
              color={c.accent}
              onClick={fetchDetail}
              bg="transparent"
              border="none"
              cursor="pointer"
              fontSize="sm"
            >
              Retry
            </Box>
          </Text>
        </Box>
      </Box>
    );
  }

  const { client, keys, auditLogs } = data;

  return (
    <Box p={{ base: 4, md: 8 }} maxW="1000px" mx="auto">
      <HStack mb={6} gap={4} flexWrap="wrap">
        <ChakraLink asChild color={c.muted} _hover={{ color: c.text }} fontSize="sm">
          <NextLink href="/admin/b2b-api-keys">← Back to B2B API Keys</NextLink>
        </ChakraLink>
      </HStack>

      {/* Client info */}
      <Box bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border} p={6} mb={6}>
        <Flex justify="space-between" align="start" flexWrap="wrap" gap={4} mb={4}>
          <Box>
            <HStack mb={1} flexWrap="wrap" gap={2}>
              <Heading size="md" color={c.text}>{client.companyName ?? client.name}</Heading>
              <StatusBadge status={client.status} />
            </HStack>
            <Text color={c.muted} fontSize="sm">{client.name}</Text>
          </Box>
          <HStack gap={2} flexWrap="wrap">
            {client.status === 'active' && (
              <Button
                size="sm"
                variant="outline"
                borderColor={c.border}
                color="yellow.400"
                _hover={{ borderColor: 'yellow.400' }}
                loading={actionLoading === 'suspend'}
                onClick={() => doAction('suspend')}
              >
                Suspend
              </Button>
            )}
            {client.status === 'suspended' && (
              <Button
                size="sm"
                variant="outline"
                borderColor={c.border}
                color="green.400"
                _hover={{ borderColor: 'green.400' }}
                loading={actionLoading === 'reactivate'}
                onClick={() => doAction('reactivate')}
              >
                Reactivate
              </Button>
            )}
            {client.status !== 'revoked' && (
              <Button
                size="sm"
                variant="outline"
                borderColor={c.border}
                color="red.400"
                _hover={{ borderColor: 'red.400' }}
                loading={actionLoading === 'revoke'}
                onClick={() => {
                  if (confirm(`Permanently revoke all keys for "${client.name}"? This cannot be undone.`)) {
                    doAction('revoke');
                  }
                }}
              >
                Revoke all
              </Button>
            )}
          </HStack>
        </Flex>

        <Box h="1px" bg={c.border} mb={4} />

        <Box
          display="grid"
          gridTemplateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
          gap={3}
          fontSize="sm"
        >
          {client.contactName && (
            <Box>
              <Text color={c.muted}>Contact</Text>
              <Text color={c.text}>{client.contactName}</Text>
            </Box>
          )}
          {client.contactEmail && (
            <Box>
              <Text color={c.muted}>Email</Text>
              <Text color={c.text}>{client.contactEmail}</Text>
            </Box>
          )}
          {client.contactPhone && (
            <Box>
              <Text color={c.muted}>Phone</Text>
              <Text color={c.text}>{client.contactPhone}</Text>
            </Box>
          )}
          <Box>
            <Text color={c.muted}>Created</Text>
            <Text color={c.text}>{new Date(client.createdAt).toLocaleString()}</Text>
          </Box>
          {client.lastUsedAt && (
            <Box>
              <Text color={c.muted}>Last used</Text>
              <Text color={c.text}>{new Date(client.lastUsedAt).toLocaleString()}</Text>
            </Box>
          )}
          {client.revokedAt && (
            <Box>
              <Text color={c.muted}>Revoked</Text>
              <Text color="red.400">{new Date(client.revokedAt).toLocaleString()}</Text>
            </Box>
          )}
          {client.notes && (
            <Box gridColumn={{ md: '1 / -1' }}>
              <Text color={c.muted}>Notes</Text>
              <Text color={c.text}>{client.notes}</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Keys */}
      <Heading size="sm" color={c.text} mb={3}>API Keys ({keys.length})</Heading>
      <VStack gap={3} align="stretch" mb={6}>
        {keys.map((key) => (
          <Box key={key.id} bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border} p={4}>
            <HStack mb={2} flexWrap="wrap" gap={2}>
              <Text color={c.text} fontWeight="semibold" fontSize="sm">{key.label}</Text>
              <StatusBadge status={key.status} />
            </HStack>
            <Box
              display="grid"
              gridTemplateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}
              gap={2}
              fontSize="xs"
            >
              <Box>
                <Text color={c.muted}>Prefix</Text>
                <Code bg={c.surface} color={c.text} px={1} fontSize="xs">{key.keyPrefix}…</Code>
              </Box>
              <Box>
                <Text color={c.muted}>Rate limit</Text>
                <Text color={c.text}>{key.rateLimitPerMinute}/min</Text>
              </Box>
              <Box>
                <Text color={c.muted}>Expires</Text>
                <Text color={c.text}>{key.expiresAt ? new Date(key.expiresAt).toLocaleString() : 'Never'}</Text>
              </Box>
              <Box>
                <Text color={c.muted}>Last used</Text>
                <Text color={c.text}>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</Text>
              </Box>
              <Box gridColumn={{ md: '1 / -1' }}>
                <Text color={c.muted}>Scopes</Text>
                <HStack flexWrap="wrap" gap={1} mt={1}>
                  {(key.allowedScopes ?? []).map((s) => (
                    <Badge key={s} bg="#431407" color="#FED7AA" fontSize="xs">{s}</Badge>
                  ))}
                </HStack>
              </Box>
              <Box gridColumn={{ md: '1 / -1' }}>
                <Text color={c.muted}>Platforms</Text>
                <HStack flexWrap="wrap" gap={1} mt={1}>
                  {(key.allowedPlatforms ?? []).map((p) => (
                    <Badge key={p} bg="#172554" color="#BFDBFE" fontSize="xs">{p}</Badge>
                  ))}
                </HStack>
              </Box>
            </Box>
          </Box>
        ))}
      </VStack>

      {/* Audit logs */}
      <Heading size="sm" color={c.text} mb={3}>Recent Audit Logs</Heading>
      {auditLogs.length === 0 ? (
        <Text color={c.muted} fontSize="sm">No audit logs yet.</Text>
      ) : (
        <Box overflowX="auto" bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border}>
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row borderBottomWidth={1} borderColor={c.border}>
                <Table.ColumnHeader color={c.muted} py={3} pl={4}>When</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} py={3}>Action</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} py={3}>Route</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} py={3}>Status</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {auditLogs.map((log) => (
                <Table.Row
                  key={log.id}
                  borderBottomWidth={1}
                  borderColor={c.border}
                  _last={{ borderBottom: 'none' }}
                >
                  <Table.Cell color={c.muted} py={2} pl={4} fontSize="xs" whiteSpace="nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell py={2} fontSize="xs">
                    <Badge
                      bg={
                        log.action.includes('rejected') || log.action.includes('denied') || log.action.includes('failed')
                          ? '#7F1D1D'
                          : log.action.includes('rate_limited')
                          ? '#713F12'
                          : '#14532D'
                      }
                      color={
                        log.action.includes('rejected') || log.action.includes('denied') || log.action.includes('failed')
                          ? '#FCA5A5'
                          : log.action.includes('rate_limited')
                          ? '#FDE68A'
                          : '#86EFAC'
                      }
                      fontSize="xs"
                    >
                      {log.action}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell color={c.muted} py={2} fontSize="xs">{log.route ?? '—'}</Table.Cell>
                  <Table.Cell color={c.muted} py={2} fontSize="xs">{log.statusCode ?? '—'}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}
