import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import type { DriverSituation } from '@/types/driverSituation';
import {
  AdminShell,
  DriverCard,
  FilterChip,
  GlassCard,
  PressScale,
  ProgressRing,
  SearchBar,
  StatePanel,
  colors,
  spacing,
  typography,
} from '@/ui';

type DriverRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  isOnline: boolean;
  activeJobRef: string | null;
  driverSituation: DriverSituation | null;
};

type DriversResponse = {
  items: DriverRow[];
  totalCount: number;
};

const filters = [
  { label: 'All Drivers', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'On Job', value: 'on_job' },
  { label: 'Offline', value: 'offline' },
];

export default function DriversScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  const { data, isLoading, error, refetch } = useQuery<DriversResponse>({
    queryKey: ['drivers', search],
    queryFn: () => apiClient.get(`/api/mobile/admin/drivers?search=${encodeURIComponent(search.trim())}`),
    refetchInterval: 15000,
  });

  const createDriver = useMutation({
    mutationFn: () =>
      apiClient.post('/api/mobile/admin/drivers', {
        name: createName,
        email: createEmail,
        phone: createPhone,
        password: createPassword,
      }),
    onSuccess: () => {
      setCreateName('');
      setCreateEmail('');
      setCreatePhone('');
      setCreatePassword('');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (filter === 'available') return items.filter((driver) => driver.isOnline && !driver.activeJobRef);
    if (filter === 'on_job') return items.filter((driver) => Boolean(driver.activeJobRef));
    if (filter === 'offline') return items.filter((driver) => !driver.isOnline);
    return items;
  }, [data?.items, filter]);

  const activeDrivers = (data?.items ?? []).filter((driver) => driver.isOnline).length;
  const capacity = data?.totalCount ? Math.round((activeDrivers / data.totalCount) * 100) : 0;
  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <AdminShell title="Drivers" subtitle="Your team on the road">
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search drivers..." onFilterPress={() => refetch()} />

      <GlassCard accent="green" animatedIndex={0}>
        <View style={styles.capacityCard}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Fleet Capacity</Text>
            <Text style={styles.capacityValue}>
              {activeDrivers} / {data?.totalCount ?? 0} active
            </Text>
            <Text style={styles.mutedText}>
              {(data?.totalCount ?? 0) - activeDrivers} drivers unavailable
            </Text>
          </View>
          <ProgressRing value={capacity} accent="green" />
        </View>
      </GlassCard>

      <View style={styles.chipWrap}>
        {filters.map((item) => (
          <FilterChip
            key={item.value}
            label={item.label}
            active={filter === item.value}
            onPress={() => setFilter(item.value)}
            accent={item.value === 'offline' ? 'red' : item.value === 'on_job' ? 'blue' : 'orange'}
          />
        ))}
      </View>

      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && filtered.length === 0}
        emptyLabel="No drivers match this view."
        onRetry={() => refetch()}
      />

      {filtered.map((driver, index) => {
        const situation = normalizeDriverSituation(driver.driverSituation);
        return (
          <DriverCard
            key={driver.id}
            name={driver.name}
            phone={driver.phone}
            status={driver.isOnline ? driver.status || 'online' : 'offline'}
            activeJobRef={driver.activeJobRef}
            situationLabel={situation.status !== 'unavailable' ? situation.label : driver.email}
            onPress={() => router.push(`/(tabs)/drivers/${driver.id}`)}
            onCallPress={() => driver.phone && Linking.openURL(`tel:${driver.phone}`).catch(() => undefined)}
            animatedIndex={index + 1}
          />
        );
      })}

      <GlassCard accent="orange" animatedIndex={filtered.length + 2}>
        <View style={styles.addHeader}>
          <View>
            <Text style={styles.sectionTitle}>Add Driver</Text>
            <Text style={styles.mutedText}>Create a driver login</Text>
          </View>
          <PressScale style={styles.mapButton} onPress={() => router.push('/(tabs)/drivers/tracking')}>
            <Ionicons name="map" size={18} color={colors.primary} />
          </PressScale>
        </View>
        <TextInput value={createName} onChangeText={setCreateName} placeholder="Name" placeholderTextColor={colors.textSubtle} style={styles.input} />
        <TextInput value={createEmail} onChangeText={setCreateEmail} placeholder="Email" placeholderTextColor={colors.textSubtle} style={styles.input} keyboardType="email-address" />
        <TextInput value={createPhone} onChangeText={setCreatePhone} placeholder="Phone" placeholderTextColor={colors.textSubtle} style={styles.input} keyboardType="phone-pad" />
        <TextInput value={createPassword} onChangeText={setCreatePassword} placeholder="Temporary password" placeholderTextColor={colors.textSubtle} style={styles.input} secureTextEntry />
        <PressScale
          style={styles.createButton}
          onPress={() => createDriver.mutate()}
          disabled={!createName || !createEmail || !createPhone || createPassword.length < 8 || createDriver.isPending}
        >
          <Ionicons name="person-add" size={18} color={colors.text} />
          <Text style={styles.createButtonText}>{createDriver.isPending ? 'Creating...' : 'Create driver'}</Text>
        </PressScale>
      </GlassCard>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  capacityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
  },
  capacityValue: {
    color: colors.text,
    fontSize: 23,
    fontWeight: typography.weight.bold,
    marginTop: spacing.xs,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  mapButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 24, 0.35)',
    backgroundColor: colors.surfaceSoft,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    fontSize: 12,
  },
  createButton: {
    minHeight: 50,
    borderRadius: 17,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  createButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
});
