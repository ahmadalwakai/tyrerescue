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
  Input,
  Textarea,
  Table,
  Code,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import {
  B2B_SCOPES,
  B2B_PLATFORMS,
  SCOPE_DESCRIPTIONS,
  PLATFORM_DESCRIPTIONS,
  ALWAYS_DENIED,
} from '@/lib/b2b/types';
import type { B2BScope, B2BPlatform } from '@/lib/b2b/types';

// ── Types ──────────────────────────────────────────────

interface KeySummary {
  id: string;
  keyPrefix: string;
  label: string;
  status: string;
  allowedScopes: B2BScope[];
  allowedPlatforms: B2BPlatform[];
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ClientRow {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  keyCount: number;
  keys: KeySummary[];
}

interface FormErrors {
  name?: string;
  contactEmail?: string;
  keyLabel?: string;
  allowedScopes?: string;
  allowedPlatforms?: string;
  rateLimitPerMinute?: string;
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

export function B2BApiKeysClient() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formKeyLabel, setFormKeyLabel] = useState('');
  const [formScopes, setFormScopes] = useState<B2BScope[]>([]);
  const [formPlatforms, setFormPlatforms] = useState<B2BPlatform[]>([]);
  const [formRateLimit, setFormRateLimit] = useState(60);
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [creating, setCreating] = useState(false);

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedPrefix, setGeneratedPrefix] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const keyCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClients = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/b2b-api-keys');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setClients(data.clients ?? []);
    } catch {
      setError('Failed to load B2B API keys. Please try again.');
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  function validateForm(): boolean {
    const errs: FormErrors = {};
    if (!formName.trim()) errs.name = 'Client name is required';
    if (formContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formContactEmail)) {
      errs.contactEmail = 'Invalid email address';
    }
    if (!formKeyLabel.trim()) errs.keyLabel = 'Key label is required';
    if (formScopes.length === 0) errs.allowedScopes = 'Select at least one scope';
    if (formPlatforms.length === 0) errs.allowedPlatforms = 'Select at least one platform';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/b2b-api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          companyName: formCompany.trim() || null,
          contactName: formContactName.trim() || null,
          contactEmail: formContactEmail.trim() || null,
          contactPhone: formContactPhone.trim() || null,
          notes: formNotes.trim() || null,
          keyLabel: formKeyLabel.trim(),
          allowedScopes: formScopes,
          allowedPlatforms: formPlatforms,
          rateLimitPerMinute: formRateLimit,
          expiresAt: formExpiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErrors({ name: data.error ?? 'Failed to create key' });
        return;
      }
      setGeneratedKey(data.rawApiKey);
      setGeneratedPrefix(data.key?.keyPrefix ?? null);
      setKeyCopied(false);
      setShowCreate(false);
      setShowKey(true);
      resetForm();
      await fetchClients();
    } catch {
      setFormErrors({ name: 'Unexpected error. Please try again.' });
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormCompany('');
    setFormContactName('');
    setFormContactEmail('');
    setFormContactPhone('');
    setFormNotes('');
    setFormKeyLabel('');
    setFormScopes([]);
    setFormPlatforms([]);
    setFormRateLimit(60);
    setFormExpiresAt('');
    setFormErrors({});
  }

  function handleOpenCreate() {
    resetForm();
    setShowCreate(true);
  }

  async function copyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
      if (keyCopiedTimerRef.current) clearTimeout(keyCopiedTimerRef.current);
      keyCopiedTimerRef.current = setTimeout(() => setKeyCopied(false), 3000);
    } catch { /* clipboard blocked */ }
  }

  function handleCloseKey() {
    setGeneratedKey(null);
    setGeneratedPrefix(null);
    setKeyCopied(false);
    setShowKey(false);
  }

  async function doAction(clientId: string, action: 'suspend' | 'revoke' | 'reactivate') {
    setActionLoading(`${clientId}:${action}`);
    try {
      const res = await fetch(`/api/admin/b2b-api-keys/${clientId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? `Failed to ${action}`);
        return;
      }
      await fetchClients();
    } catch {
      alert(`Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  function renderAccessPreview() {
    const allowed: string[] = [];
    const denied: string[] = [...ALWAYS_DENIED];

    if (formScopes.includes('stock:read')) allowed.push('Tyre stock listing');
    if (formScopes.includes('stock:availability:read')) allowed.push('Stock availability checks');
    if (formScopes.includes('stock:prices:read')) allowed.push('Tyre selling prices');
    else denied.push('Tyre prices (requires stock:prices:read)');
    if (formScopes.includes('stock:reserve')) allowed.push('Atomic stock reservation');
    if (formScopes.includes('stock:movement:read')) allowed.push('Stock movement history (read-only)');
    if (formScopes.includes('stock:sync:read')) allowed.push('Stock sync for app integrations');
    if (formPlatforms.includes('android_admin_app')) allowed.push('Android admin app access');
    if (formPlatforms.includes('android_mobile_app')) allowed.push('Android mobile app access');

    return (
      <Box bg={c.surface} borderRadius="md" p={4} borderWidth={1} borderColor={c.border} fontSize="sm">
        <Text fontWeight="semibold" color={c.text} mb={2}>Access preview</Text>
        {allowed.length > 0 && (
          <>
            <Text color="green.400" fontWeight="medium" mb={1}>This key CAN access:</Text>
            <VStack align="start" gap={0} mb={3}>
              {allowed.map((a) => <Text key={a} color={c.text}>✓ {a}</Text>)}
            </VStack>
          </>
        )}
        <Text color="red.400" fontWeight="medium" mb={1}>This key CANNOT access:</Text>
        <VStack align="start" gap={0}>
          {denied.map((d) => <Text key={d} color={c.muted}>✗ {d}</Text>)}
        </VStack>
      </Box>
    );
  }

  // ── Render ──

  return (
    <Box p={{ base: 4, md: 8 }} maxW="1200px" mx="auto">
      <Flex justify="space-between" align="center" mb={6} flexWrap="wrap" gap={4}>
        <Box>
          <Heading size="lg" color={c.text}>B2B API Keys</Heading>
          <Text color={c.muted} mt={1}>Generate secure API keys for approved B2B stock access.</Text>
        </Box>
        <Button
          bg={c.accent}
          color="white"
          _hover={{ bg: c.accentHover }}
          onClick={handleOpenCreate}
          aria-label="Create new B2B API key"
        >
          + New API Key
        </Button>
      </Flex>

      {pageLoading ? (
        <Flex justify="center" py={16}><Spinner color={c.accent} size="lg" /></Flex>
      ) : error ? (
        <Box bg={c.card} borderRadius="md" p={4} borderWidth={1} borderColor="red.800">
          <Text color="red.400" fontWeight="medium" mb={1}>Error</Text>
          <Text color={c.muted} fontSize="sm">
            {error}{' '}
            <Box as="button" color={c.accent} onClick={fetchClients} style={{ cursor: 'pointer', background: 'none', border: 'none' }}>
              Retry
            </Box>
          </Text>
        </Box>
      ) : clients.length === 0 ? (
        <Box textAlign="center" py={16} bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border}>
          <Text color={c.muted} fontSize="lg">No B2B API keys yet.</Text>
          <Text color={c.muted} mt={2}>Click &ldquo;+ New API Key&rdquo; to generate one for an approved partner.</Text>
        </Box>
      ) : (
        <VStack gap={4} align="stretch">
          {clients.map((client) => (
            <Box key={client.id} bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border} p={5}>
              <Flex justify="space-between" align="start" flexWrap="wrap" gap={3}>
                <Box flex={1} minW="200px">
                  <HStack mb={1} flexWrap="wrap" gap={2}>
                    <Heading size="sm" color={c.text}>{client.companyName ?? client.name}</Heading>
                    <StatusBadge status={client.status} />
                  </HStack>
                  {client.contactName && (
                    <Text color={c.muted} fontSize="sm">
                      {client.contactName}
                      {client.contactEmail && ` — ${client.contactEmail}`}
                      {client.contactPhone && ` — ${client.contactPhone}`}
                    </Text>
                  )}
                  <Text color={c.muted} fontSize="xs" mt={1}>
                    {client.keyCount} key{client.keyCount !== 1 ? 's' : ''} · Created{' '}
                    {new Date(client.createdAt).toLocaleDateString()}
                    {client.lastUsedAt && ` · Last used ${new Date(client.lastUsedAt).toLocaleDateString()}`}
                  </Text>
                </Box>
                <HStack gap={2} flexWrap="wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    borderColor={c.border}
                    color={c.text}
                    _hover={{ borderColor: c.accent, color: c.accent }}
                    onClick={() => router.push(`/admin/b2b-api-keys/${client.id}`)}
                  >
                    View
                  </Button>
                  {client.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={c.border}
                      color="yellow.400"
                      _hover={{ borderColor: 'yellow.400' }}
                      loading={actionLoading === `${client.id}:suspend`}
                      onClick={() => doAction(client.id, 'suspend')}
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
                      loading={actionLoading === `${client.id}:reactivate`}
                      onClick={() => doAction(client.id, 'reactivate')}
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
                      loading={actionLoading === `${client.id}:revoke`}
                      onClick={() => {
                        if (confirm(`Permanently revoke all keys for "${client.name}"? This cannot be undone.`)) {
                          doAction(client.id, 'revoke');
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </HStack>
              </Flex>

              {client.keys.length > 0 && (
                <Box mt={4} overflowX="auto">
                  <Table.Root size="sm">
                    <Table.Header>
                      <Table.Row borderBottomWidth={1} borderColor={c.border}>
                        <Table.ColumnHeader color={c.muted} pb={2}>Label</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Prefix</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Status</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Scopes</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Rate limit</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Last used</Table.ColumnHeader>
                        <Table.ColumnHeader color={c.muted} pb={2}>Expires</Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {client.keys.map((key) => (
                        <Table.Row key={key.id} borderBottomWidth={1} borderColor={c.border} _last={{ borderBottom: 'none' }}>
                          <Table.Cell color={c.text} py={2}>{key.label}</Table.Cell>
                          <Table.Cell py={2}>
                            <Code fontSize="xs" bg={c.surface} color={c.muted} px={1} borderRadius="sm">{key.keyPrefix}…</Code>
                          </Table.Cell>
                          <Table.Cell py={2}><StatusBadge status={key.status} /></Table.Cell>
                          <Table.Cell color={c.muted} py={2} fontSize="xs">{(key.allowedScopes ?? []).join(', ') || '—'}</Table.Cell>
                          <Table.Cell color={c.muted} py={2} fontSize="xs">{key.rateLimitPerMinute}/min</Table.Cell>
                          <Table.Cell color={c.muted} py={2} fontSize="xs">
                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                          </Table.Cell>
                          <Table.Cell color={c.muted} py={2} fontSize="xs">
                            {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )}
            </Box>
          ))}
        </VStack>
      )}

      {/* ── Create overlay ── */}
      {showCreate && (
        <Box
          position="fixed"
          inset={0}
          zIndex={200}
          bg="rgba(0,0,0,0.75)"
          overflowY="auto"
          display="flex"
          alignItems="flex-start"
          justifyContent="center"
          p={4}
        >
          <Box
            bg={c.card}
            borderRadius="md"
            borderWidth={1}
            borderColor={c.border}
            w="100%"
            maxW="600px"
            my={8}
          >
            <Flex justify="space-between" align="center" px={6} py={4} borderBottomWidth={1} borderColor={c.border}>
              <Heading size="md" color={c.text}>Create B2B API Key</Heading>
              <Box
                as="button"
                color={c.muted}
                fontSize="xl"
                onClick={() => { setShowCreate(false); resetForm(); }}
                bg="transparent"
                border="none"
                cursor="pointer"
                aria-label="Close"
              >
                ✕
              </Box>
            </Flex>

            <Box px={6} py={4}>
              <VStack gap={4} align="stretch">
                <Heading size="xs" color={c.muted} textTransform="uppercase" letterSpacing="wider">
                  Client details
                </Heading>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={1}>Client name <Text as="span" color="red.400">*</Text></Text>
                  <Input
                    {...inputProps}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Acme Tyres Ltd"
                    aria-label="Client name"
                  />
                  {formErrors.name && <Text color="red.400" fontSize="xs" mt={1}>{formErrors.name}</Text>}
                </Box>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={1}>Company name</Text>
                  <Input
                    {...inputProps}
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Acme Holdings plc"
                  />
                </Box>

                <Flex gap={3} flexWrap="wrap">
                  <Box flex={1} minW="140px">
                    <Text color={c.input.label} fontSize="sm" mb={1}>Contact name</Text>
                    <Input
                      {...inputProps}
                      value={formContactName}
                      onChange={(e) => setFormContactName(e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </Box>
                  <Box flex={1} minW="140px">
                    <Text color={c.input.label} fontSize="sm" mb={1}>Contact email</Text>
                    <Input
                      {...inputProps}
                      type="email"
                      value={formContactEmail}
                      onChange={(e) => setFormContactEmail(e.target.value)}
                      placeholder="jane@acme.com"
                    />
                    {formErrors.contactEmail && <Text color="red.400" fontSize="xs" mt={1}>{formErrors.contactEmail}</Text>}
                  </Box>
                  <Box flex={1} minW="120px">
                    <Text color={c.input.label} fontSize="sm" mb={1}>Contact phone</Text>
                    <Input
                      {...inputProps}
                      value={formContactPhone}
                      onChange={(e) => setFormContactPhone(e.target.value)}
                      placeholder="+44 7700 000000"
                    />
                  </Box>
                </Flex>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={1}>Notes</Text>
                  <Textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Internal notes about this client…"
                    bg={c.input.bg}
                    borderColor={c.input.border}
                    color={c.input.text}
                    _focus={{ borderColor: c.input.borderFocus }}
                    rows={2}
                  />
                </Box>

                <Box h="1px" bg={c.border} />
                <Heading size="xs" color={c.muted} textTransform="uppercase" letterSpacing="wider">
                  Key settings
                </Heading>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={1}>Key label <Text as="span" color="red.400">*</Text></Text>
                  <Input
                    {...inputProps}
                    value={formKeyLabel}
                    onChange={(e) => setFormKeyLabel(e.target.value)}
                    placeholder="Production stock read"
                  />
                  {formErrors.keyLabel && <Text color="red.400" fontSize="xs" mt={1}>{formErrors.keyLabel}</Text>}
                </Box>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={2}>Scopes <Text as="span" color="red.400">*</Text></Text>
                  <VStack align="start" gap={1}>
                    {B2B_SCOPES.map((s) => (
                      <Flex
                        key={s}
                        align="center"
                        gap={2}
                        cursor="pointer"
                        role="checkbox"
                        aria-checked={formScopes.includes(s)}
                        aria-label={s}
                        tabIndex={0}
                        onClick={() => {
                          if (formScopes.includes(s)) setFormScopes((p) => p.filter((x) => x !== s));
                          else setFormScopes((p) => [...p, s]);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            if (formScopes.includes(s)) setFormScopes((p) => p.filter((x) => x !== s));
                            else setFormScopes((p) => [...p, s]);
                          }
                        }}
                      >
                        <Box
                          w="14px"
                          h="14px"
                          borderRadius="2px"
                          border="2px solid"
                          borderColor={formScopes.includes(s) ? c.accent : c.border}
                          bg={formScopes.includes(s) ? c.accent : 'transparent'}
                          flexShrink={0}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          {formScopes.includes(s) && (
                            <Text color="white" fontSize="8px" lineHeight={1}>✓</Text>
                          )}
                        </Box>
                        <Text color={c.text} fontSize="sm">
                          <Text as="span" fontFamily="mono" fontSize="xs" color={c.accent}>{s}</Text>
                          {' '}— {SCOPE_DESCRIPTIONS[s]}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>
                  {formErrors.allowedScopes && <Text color="red.400" fontSize="xs" mt={1}>{formErrors.allowedScopes}</Text>}
                </Box>

                <Box>
                  <Text color={c.input.label} fontSize="sm" mb={2}>Allowed platforms <Text as="span" color="red.400">*</Text></Text>
                  <VStack align="start" gap={1}>
                    {B2B_PLATFORMS.map((p) => (
                      <Flex
                        key={p}
                        align="center"
                        gap={2}
                        cursor="pointer"
                        role="checkbox"
                        aria-checked={formPlatforms.includes(p)}
                        aria-label={p}
                        tabIndex={0}
                        onClick={() => {
                          if (formPlatforms.includes(p)) setFormPlatforms((prev) => prev.filter((x) => x !== p));
                          else setFormPlatforms((prev) => [...prev, p]);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            if (formPlatforms.includes(p)) setFormPlatforms((prev) => prev.filter((x) => x !== p));
                            else setFormPlatforms((prev) => [...prev, p]);
                          }
                        }}
                      >
                        <Box
                          w="14px"
                          h="14px"
                          borderRadius="2px"
                          border="2px solid"
                          borderColor={formPlatforms.includes(p) ? c.accent : c.border}
                          bg={formPlatforms.includes(p) ? c.accent : 'transparent'}
                          flexShrink={0}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          {formPlatforms.includes(p) && (
                            <Text color="white" fontSize="8px" lineHeight={1}>✓</Text>
                          )}
                        </Box>
                        <Text color={c.text} fontSize="sm">
                          <Text as="span" fontFamily="mono" fontSize="xs" color={c.accent}>{p}</Text>
                          {' '}— {PLATFORM_DESCRIPTIONS[p]}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>
                  {formErrors.allowedPlatforms && <Text color="red.400" fontSize="xs" mt={1}>{formErrors.allowedPlatforms}</Text>}
                </Box>

                <Flex gap={4} flexWrap="wrap">
                  <Box flex={1} minW="140px">
                    <Text color={c.input.label} fontSize="sm" mb={1}>Rate limit (per min)</Text>
                    <Input
                      {...inputProps}
                      type="number"
                      value={formRateLimit}
                      onChange={(e) => setFormRateLimit(parseInt(e.target.value, 10) || 60)}
                      min={1}
                      max={10000}
                      aria-label="Rate limit per minute"
                    />
                  </Box>
                  <Box flex={1} minW="160px">
                    <Text color={c.input.label} fontSize="sm" mb={1}>Expiry date (optional)</Text>
                    <Input
                      {...inputProps}
                      type="datetime-local"
                      value={formExpiresAt}
                      onChange={(e) => setFormExpiresAt(e.target.value)}
                    />
                  </Box>
                </Flex>

                {(formScopes.length > 0 || formPlatforms.length > 0) && renderAccessPreview()}
              </VStack>
            </Box>

            <Flex justify="flex-end" gap={3} px={6} py={4} borderTopWidth={1} borderColor={c.border}>
              <Button
                variant="ghost"
                color={c.muted}
                onClick={() => { setShowCreate(false); resetForm(); }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                bg={c.accent}
                color="white"
                _hover={{ bg: c.accentHover }}
                onClick={handleCreate}
                loading={creating}
                disabled={creating}
                aria-label="Generate API key"
              >
                {creating ? 'Generating…' : 'Generate Key'}
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {/* ── Raw key display overlay ── */}
      {showKey && (
        <Box
          position="fixed"
          inset={0}
          zIndex={200}
          bg="rgba(0,0,0,0.75)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box bg={c.card} borderRadius="md" borderWidth={1} borderColor={c.border} w="100%" maxW="520px">
            <Flex justify="space-between" align="center" px={6} py={4} borderBottomWidth={1} borderColor={c.border}>
              <Heading size="md" color={c.text}>API Key Generated</Heading>
            </Flex>

            <Box px={6} py={4}>
              <Box bg="orange.900" borderRadius="md" p={4} mb={4}>
                <Text color="orange.200" fontWeight="semibold" mb={1}>Copy this key now</Text>
                <Text color="orange.100" fontSize="sm">
                  This key will not be shown again. Copy it and store it securely.
                </Text>
              </Box>

              {generatedKey && (
                <Box bg={c.surface} p={3} borderRadius="md" borderWidth={1} borderColor={c.border} mb={4}>
                  <Text color={c.muted} fontSize="xs" mb={2}>Raw API key (single display only):</Text>
                  <Flex align="center" gap={2}>
                    <Code
                      flex={1}
                      fontSize="xs"
                      bg="transparent"
                      color={c.accent}
                      wordBreak="break-all"
                      fontFamily="mono"
                      aria-label="API key"
                    >
                      {generatedKey}
                    </Code>
                    <Button
                      size="sm"
                      onClick={copyKey}
                      bg={keyCopied ? 'green.600' : c.accent}
                      color="white"
                      _hover={{ bg: keyCopied ? 'green.500' : c.accentHover }}
                      minW="70px"
                      aria-label="Copy API key to clipboard"
                    >
                      {keyCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </Flex>
                </Box>
              )}

              {generatedPrefix && (
                <Text color={c.muted} fontSize="sm">
                  Key prefix (for future identification):{' '}
                  <Code bg={c.surface} color={c.text} px={1}>{generatedPrefix}…</Code>
                </Text>
              )}
            </Box>

            <Flex justify="flex-end" px={6} py={4} borderTopWidth={1} borderColor={c.border}>
              <Button
                bg={c.accent}
                color="white"
                _hover={{ bg: c.accentHover }}
                onClick={handleCloseKey}
              >
                I have copied the key
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
}
