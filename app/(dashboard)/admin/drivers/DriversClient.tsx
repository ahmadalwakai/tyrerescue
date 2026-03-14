'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Table,
  VStack,
  HStack,
  Text,
  Heading,
  Input,
  Grid,
  GridItem,
  Button,
  Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

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

export function DriversClient({ drivers }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
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

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatLocation(driver: Driver): string {
    if (!driver.currentLat || !driver.currentLng) return '-';
    const lat = parseFloat(driver.currentLat).toFixed(4);
    const lng = parseFloat(driver.currentLng).toFixed(4);
    return `${lat}, ${lng}`;
  }

  function formatLocationTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '(just now)';
    if (diffMins < 60) return `(${diffMins}m ago)`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `(${diffHours}h ago)`;
    return `(${Math.floor(diffHours / 24)}d ago)`;
  }

  return (
    <VStack align="stretch" gap={6}>
      {/* Add driver button / form */}
      {!showForm ? (
        <Box>
          <Button onClick={() => setShowForm(true)}>Add Driver</Button>
        </Box>
      ) : (
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
          <Heading size="md" mb={4} color={c.text}>
            Add New Driver
          </Heading>
          <form onSubmit={handleSubmit}>
            <Grid templateColumns="repeat(2, 1fr)" gap={4} mb={4}>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" mb={1}>
                  Name
                </Text>
                <Input {...inputProps}
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Full name"
                  required
                />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" mb={1}>
                  Email
                </Text>
                <Input {...inputProps}
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                  required
                />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" mb={1}>
                  Phone
                </Text>
                <Input {...inputProps}
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="07xxx xxxxxx"
                  required
                />
              </GridItem>
              <GridItem>
                <Text fontSize="sm" fontWeight="medium" mb={1}>
                  Password
                </Text>
                <Input {...inputProps}
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Initial password"
                  required
                  minLength={8}
                />
              </GridItem>
            </Grid>
            {error && (
              <Text color="red.400" fontSize="sm" mb={4}>
                {error}
              </Text>
            )}
            {success && (
              <Text color="green.400" fontSize="sm" mb={4}>
                {success}
              </Text>
            )}
            <HStack>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <HStack gap={2}>
                    <Spinner size="sm" />
                    <Text>Creating...</Text>
                  </HStack>
                ) : (
                  'Create Driver'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setError('');
                }}
              >
                Cancel
              </Button>
            </HStack>
          </form>
        </Box>
      )}

      {/* Drivers table */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={anim.fadeUp('0.5s')}>
        <Table.Root size="md">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Name</Table.ColumnHeader>
              <Table.ColumnHeader>Email</Table.ColumnHeader>
              <Table.ColumnHeader>Phone</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
              <Table.ColumnHeader>Location</Table.ColumnHeader>
              <Table.ColumnHeader>Created</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {drivers.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Text textAlign="center" py={8} color={c.muted}>
                    No drivers found
                  </Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              drivers.map((driver, i) => (
                <Table.Row key={driver.id} style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}>
                  <Table.Cell fontWeight="medium">{driver.name}</Table.Cell>
                  <Table.Cell>{driver.email}</Table.Cell>
                  <Table.Cell>{driver.phone || '-'}</Table.Cell>
                  <Table.Cell>
                    <Text
                      fontWeight="medium"
                      color={driver.isOnline ? 'green.400' : c.muted}
                    >
                      {driver.isOnline ? 'Online' : 'Offline'}
                      {driver.status && driver.status !== 'offline' && (
                        <Text as="span" fontWeight="normal" fontSize="sm">
                          {' '}
                          ({driver.status})
                        </Text>
                      )}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text>
                      {formatLocation(driver)}
                      {driver.locationAt && (
                        <Text as="span" fontSize="sm" color={c.muted}>
                          {' '}
                          {formatLocationTime(driver.locationAt)}
                        </Text>
                      )}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{formatDate(driver.createdAt)}</Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Summary */}
      <Text fontSize="sm" color={c.muted}>
        {drivers.length} driver{drivers.length !== 1 ? 's' : ''} total,{' '}
        {drivers.filter((d) => d.isOnline).length} online
      </Text>
    </VStack>
  );
}
