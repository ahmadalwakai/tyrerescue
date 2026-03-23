'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Table,
  Flex,
  VStack,
  HStack,
  Text,
  Heading,
  Input,
  Grid,
  GridItem,
  Button,
  Spinner,
  NativeSelect,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

import {
  getDriverPresenceState,
  PRESENCE_LABELS,
  PRESENCE_COLORS,
  type DriverPresenceState,
} from '@/lib/driver-presence';

interface Driver {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  isOnline: boolean;
  status: string;
  currentLat: string | null;
  currentLng: string | null;
  locationAt: string | null;
  createdAt: string | null;
}

interface Props {
  drivers: Driver[];
}

const STATUS_OPTIONS = [
  { value: 'offline', label: 'Offline', color: c.muted },
  { value: 'available', label: 'Available', color: 'green' },
  { value: 'en_route', label: 'En Route', color: '#3B82F6' },
  { value: 'arrived', label: 'Arrived', color: '#8B5CF6' },
  { value: 'in_progress', label: 'In Progress', color: c.accent },
];

function statusColor(status: string): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color ?? c.muted;
}

export function DriversClient({ drivers: initialDrivers }: Props) {
  const router = useRouter();
  const [drivers] = useState(initialDrivers);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', email: '', phone: '', status: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Search/filter
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  // ── CREATE ──
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create driver');
      }
      setSuccess('Driver created successfully');
      setFormData({ name: '', email: '', phone: '', password: '' });
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create driver');
    } finally {
      setLoading(false);
    }
  }

  // ── EDIT ──
  function startEdit(driver: Driver) {
    setEditId(driver.id);
    setEditData({ name: driver.name, email: driver.email, phone: driver.phone || '', status: driver.status || 'offline' });
    setEditError('');
  }

  function cancelEdit() {
    setEditId(null);
    setEditError('');
  }

  async function handleSave() {
    if (!editId) return;
    setEditLoading(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/drivers/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      setEditId(null);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  }

  // ── STATUS CHANGE (quick) ──
  async function handleStatusChange(driverId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/admin/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change status');
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change status');
    }
  }

  // ── DELETE ──
  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/drivers/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setDeleteId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── HELPERS ──
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatLocation(driver: Driver): string {
    if (!driver.currentLat || !driver.currentLng) return '-';
    return `${parseFloat(driver.currentLat).toFixed(4)}, ${parseFloat(driver.currentLng).toFixed(4)}`;
  }
  function formatLocationTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMins < 1) return '(just now)';
    if (diffMins < 60) return `(${diffMins}m ago)`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `(${diffHours}h ago)`;
    return `(${Math.floor(diffHours / 24)}d ago)`;
  }

  function getPresence(driver: Driver): DriverPresenceState {
    return getDriverPresenceState(
      { isOnline: driver.isOnline, locationAt: driver.locationAt, status: driver.status },
      null, // Active booking not loaded in admin list — simplified view
    );
  }

  // ── FILTER ──
  const filtered = drivers.filter((d) => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'online') {
        const p = getPresence(d);
        if (p === 'offline') return false;
      }
      if (filterStatus === 'offline') {
        const p = getPresence(d);
        if (p !== 'offline') return false;
      }
      if (!['online', 'offline', 'all'].includes(filterStatus) && d.status !== filterStatus) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || (d.phone && d.phone.includes(q));
    }
    return true;
  });

  return (
    <VStack align="stretch" gap={6}>
      {/* Top bar: search + filter + add */}
      <Flex gap={3} wrap="wrap" align="center">
        <Input
          {...inputProps}
          placeholder="Search drivers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxW="280px"
          flex={1}
        />
        <NativeSelect.Root maxW="180px">
          <NativeSelect.Field
            bg={c.card}
            color={c.text}
            borderColor={c.border}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            {STATUS_OPTIONS.filter((s) => s.value !== 'offline').map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
        <Button
          bg={c.accent}
          color="#09090B"
          fontWeight="600"
          _hover={{ bg: c.accentHover }}
          onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }}
        >
          {showForm ? 'Cancel' : '+ Add Driver'}
        </Button>
      </Flex>

      {/* Success message */}
      {success && (
        <Box bg="rgba(34,197,94,0.1)" border="1px solid" borderColor="green.500" borderRadius="md" p={3}>
          <Text fontSize="sm" color="green.400">{success}</Text>
        </Box>
      )}

      {/* Create form */}
      {showForm && (
        <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.3s')}>
          <Heading size="md" mb={4} color={c.text}>Add New Driver</Heading>
          <form onSubmit={handleCreate}>
            <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4} mb={4}>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>Name</Text>
                <Input {...inputProps} value={formData.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Full name" required />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>Email</Text>
                <Input {...inputProps} type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} placeholder="email@example.com" required />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>Phone</Text>
                <Input {...inputProps} type="tel" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="07xxx xxxxxx" required />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>Password</Text>
                <Input {...inputProps} type="password" value={formData.password} onChange={(e) => updateField('password', e.target.value)} placeholder="Min 8 characters" required minLength={8} />
              </GridItem>
            </Grid>
            {error && <Text color="red.400" fontSize="sm" mb={3}>{error}</Text>}
            <HStack>
              <Button type="submit" bg={c.accent} color="#09090B" _hover={{ bg: c.accentHover }} disabled={loading}>
                {loading ? <HStack gap={2}><Spinner size="sm" /><Text>Creating…</Text></HStack> : 'Create Driver'}
              </Button>
              <Button variant="outline" borderColor={c.border} color={c.muted} onClick={() => { setShowForm(false); setError(''); }}>Cancel</Button>
            </HStack>
          </form>
        </Box>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <Box bg="rgba(239,68,68,0.08)" border="1px solid" borderColor="red.500" borderRadius="md" p={4} style={anim.scaleIn('0.2s')}>
          <Text color="red.400" fontWeight="600" mb={2}>Delete Driver</Text>
          <Text color={c.text} fontSize="sm" mb={3}>
            Are you sure? This will permanently delete the driver account and unlink all their completed bookings. Active bookings must be reassigned first.
          </Text>
          {deleteError && <Text color="red.400" fontSize="sm" mb={2}>{deleteError}</Text>}
          <HStack>
            <Button bg="red.500" color="white" _hover={{ bg: 'red.600' }} onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <Spinner size="sm" /> : 'Yes, Delete'}
            </Button>
            <Button variant="outline" borderColor={c.border} color={c.muted} onClick={() => { setDeleteId(null); setDeleteError(''); }}>Cancel</Button>
          </HStack>
        </Box>
      )}

      {/* Drivers table - desktop */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={anim.fadeUp('0.5s')} display={{ base: 'none', md: 'block' }}>
        <Table.Root size="md">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader color={c.muted}>Name</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted}>Email</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted}>Phone</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted}>Status</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted}>Location</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted}>Created</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} textAlign="right">Actions</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={7}>
                  <Text textAlign="center" py={8} color={c.muted}>No drivers found</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              filtered.map((driver, i) => {
                const isEditing = editId === driver.id;
                return (
                  <Table.Row key={driver.id} style={anim.stagger('fadeUp', i, '0.3s', 0.05, 0.02)}>
                    <Table.Cell>
                      {isEditing ? (
                        <Input {...inputProps} size="sm" value={editData.name} onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))} />
                      ) : (
                        <Text fontWeight="medium" color={c.text}>{driver.name}</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {isEditing ? (
                        <Input {...inputProps} size="sm" type="email" value={editData.email} onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))} />
                      ) : (
                        <Text color={c.text}>{driver.email}</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {isEditing ? (
                        <Input {...inputProps} size="sm" value={editData.phone} onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))} />
                      ) : (
                        <Text color={c.text}>{driver.phone || '-'}</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {isEditing ? (
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field
                            bg={c.surface}
                            color={c.text}
                            borderColor={c.border}
                            value={editData.status}
                            onChange={(e) => setEditData((p) => ({ ...p, status: e.target.value }))}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      ) : (
                        <HStack gap={2}>
                          <Box w="8px" h="8px" borderRadius="full" bg={statusColor(driver.status)} />
                          <NativeSelect.Root size="sm" maxW="130px">
                            <NativeSelect.Field
                              bg="transparent"
                              color={c.text}
                              border="none"
                              p={0}
                              fontSize="sm"
                              cursor="pointer"
                              value={driver.status || 'offline'}
                              onChange={(e) => handleStatusChange(driver.id, e.target.value)}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </NativeSelect.Field>
                          </NativeSelect.Root>
                        </HStack>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text color={c.text} fontSize="sm">
                        {formatLocation(driver)}
                        {driver.locationAt && (
                          <Text as="span" color={c.muted}> {formatLocationTime(driver.locationAt)}</Text>
                        )}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color={c.muted} fontSize="sm">{formatDate(driver.createdAt)}</Text>
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      {isEditing ? (
                        <HStack gap={1} justify="flex-end">
                          {editError && <Text color="red.400" fontSize="xs">{editError}</Text>}
                          <Button size="xs" bg={c.accent} color="#09090B" _hover={{ bg: c.accentHover }} onClick={handleSave} disabled={editLoading}>
                            {editLoading ? <Spinner size="xs" /> : 'Save'}
                          </Button>
                          <Button size="xs" variant="outline" borderColor={c.border} color={c.muted} onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </HStack>
                      ) : (
                        <HStack gap={1} justify="flex-end">
                          <Button size="xs" variant="outline" borderColor={c.border} color={c.muted} _hover={{ borderColor: c.accent, color: c.accent }} onClick={() => startEdit(driver)}>
                            Edit
                          </Button>
                          <Button size="xs" variant="outline" borderColor={c.border} color={c.muted} _hover={{ borderColor: 'red.400', color: 'red.400' }} onClick={() => setDeleteId(driver.id)}>
                            Delete
                          </Button>
                        </HStack>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Drivers cards - mobile */}
      <VStack gap={3} display={{ base: 'flex', md: 'none' }} align="stretch">
        {filtered.length === 0 ? (
          <Text textAlign="center" py={8} color={c.muted}>No drivers found</Text>
        ) : (
          filtered.map((driver) => {
            const isEditing = editId === driver.id;
            return (
              <Box key={driver.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="md" p={4}>
                {isEditing ? (
                  <VStack align="stretch" gap={3}>
                    <Box>
                      <Text fontSize="xs" color={c.muted} mb={1}>Name</Text>
                      <Input {...inputProps} size="sm" value={editData.name} onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))} />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color={c.muted} mb={1}>Email</Text>
                      <Input {...inputProps} size="sm" type="email" value={editData.email} onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))} />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color={c.muted} mb={1}>Phone</Text>
                      <Input {...inputProps} size="sm" value={editData.phone} onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))} />
                    </Box>
                    <Box>
                      <Text fontSize="xs" color={c.muted} mb={1}>Status</Text>
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field bg={c.surface} color={c.text} borderColor={c.border} value={editData.status} onChange={(e) => setEditData((p) => ({ ...p, status: e.target.value }))}>
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Box>
                    {editError && <Text color="red.400" fontSize="xs">{editError}</Text>}
                    <HStack>
                      <Button size="sm" bg={c.accent} color="#09090B" _hover={{ bg: c.accentHover }} onClick={handleSave} disabled={editLoading} flex={1} minH="40px">
                        {editLoading ? <Spinner size="sm" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" borderColor={c.border} color={c.muted} onClick={cancelEdit} flex={1} minH="40px">Cancel</Button>
                    </HStack>
                  </VStack>
                ) : (
                  <>
                    <Flex justify="space-between" align="center" mb={2}>
                      <Text fontWeight="bold" color={c.text}>{driver.name}</Text>
                      <HStack gap={1}>
                        {(() => {
                          const p = getPresence(driver);
                          const pColor = PRESENCE_COLORS[p];
                          return (
                            <>
                              <Box w="8px" h="8px" borderRadius="full" bg={`${pColor}.400`} />
                              <Text fontSize="xs" fontWeight="medium" color={`${pColor}.400`}>
                                {PRESENCE_LABELS[p]}
                              </Text>
                            </>
                          );
                        })()}
                      </HStack>
                    </Flex>
                    <Text fontSize="sm" color={c.muted} mb={1}>{driver.email}</Text>
                    <Text fontSize="sm" color={c.muted} mb={2}>{driver.phone || 'No phone'}</Text>

                    {/* Quick status change */}
                    <Box mb={3}>
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field
                          bg={c.surface}
                          color={c.text}
                          borderColor={c.border}
                          value={driver.status || 'offline'}
                          onChange={(e) => handleStatusChange(driver.id, e.target.value)}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Box>

                    <Flex gap={2}>
                      <Button size="xs" variant="outline" borderColor={c.border} color={c.muted} _hover={{ borderColor: c.accent, color: c.accent }} onClick={() => startEdit(driver)} flex={1} minH="36px">
                        Edit
                      </Button>
                      <Button size="xs" variant="outline" borderColor={c.border} color={c.muted} _hover={{ borderColor: 'red.400', color: 'red.400' }} onClick={() => setDeleteId(driver.id)} flex={1} minH="36px">
                        Delete
                      </Button>
                    </Flex>
                  </>
                )}
              </Box>
            );
          })
        )}
      </VStack>

      {/* Summary */}
      <Text fontSize="sm" color={c.muted}>
        {filtered.length}{filtered.length !== drivers.length ? ` of ${drivers.length}` : ''} driver{filtered.length !== 1 ? 's' : ''},{' '}
        {drivers.filter((d) => getPresence(d) !== 'offline').length} online
      </Text>
    </VStack>
  );
}
