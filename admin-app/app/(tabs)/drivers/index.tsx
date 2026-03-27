import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type DriverRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  isOnline: boolean;
};

type DriversResponse = {
  items: DriverRow[];
  totalCount: number;
};

export default function DriversScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  const { data, isLoading, error } = useQuery<DriversResponse>({
    queryKey: ['drivers', search],
    queryFn: () => apiClient.get(`/api/mobile/admin/drivers?search=${encodeURIComponent(search)}`),
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

  return (
    <Screen>
      <Text style={styles.title}>Drivers</Text>
      <InputField label="Search" value={search} onChangeText={setSearch} placeholder="Name, email, or phone" />

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No drivers found"
      />

      {data?.items?.map((driver) => (
        <Pressable key={driver.id} style={styles.row} onPress={() => router.push(`/(tabs)/drivers/${driver.id}`)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{driver.name}</Text>
            <Text style={styles.meta}>{driver.email}</Text>
            <Text style={styles.meta}>{driver.phone || 'No phone'}</Text>
          </View>
          <StatusChip status={driver.status} />
        </Pressable>
      ))}

      <Card>
        <Text style={styles.sectionTitle}>Create driver</Text>
        <InputField label="Name" value={createName} onChangeText={setCreateName} />
        <InputField label="Email" value={createEmail} onChangeText={setCreateEmail} />
        <InputField label="Phone" value={createPhone} onChangeText={setCreatePhone} />
        <InputField label="Temporary password" value={createPassword} onChangeText={setCreatePassword} />
        <PrimaryButton
          title={createDriver.isPending ? 'Creating...' : 'Create driver'}
          onPress={() => createDriver.mutate()}
          disabled={!createName || !createEmail || !createPhone || createPassword.length < 8 || createDriver.isPending}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
});
