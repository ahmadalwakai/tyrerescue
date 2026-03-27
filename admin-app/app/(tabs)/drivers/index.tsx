import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from '@/ui/StatusPill';
import { ListRow } from '@/ui/ListRow';
import { SectionHeader } from '@/ui/SectionHeader';
import { colors, radius, spacing } from '@/ui/theme';

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
      <InputField label="Search" value={search} onChangeText={setSearch} placeholder="Name, email, or phone" />

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No drivers found"
      />

      {data?.items && data.items.length > 0 && (
        <View style={styles.driversList}>
          {data.items.map((driver, index) => (
            <ListRow
              key={driver.id}
              title={driver.name}
              subtitle={driver.email}
              rightContent={<StatusChip status={driver.status} />}
              onPress={() => router.push(`/(tabs)/drivers/${driver.id}`)}
              divider={index < data.items.length - 1}
            />
          ))}
        </View>
      )}

      <SectionHeader title="Add driver" subtitle={data?.totalCount ? `${data.totalCount} total` : undefined} />
      <Card>
        <InputField label="Name" value={createName} onChangeText={setCreateName} />
        <InputField label="Email" value={createEmail} onChangeText={setCreateEmail} keyboardType="email-address" />
        <InputField label="Phone" value={createPhone} onChangeText={setCreatePhone} keyboardType="phone-pad" />
        <InputField label="Temporary password" value={createPassword} onChangeText={setCreatePassword} secureTextEntry />
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
  driversList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
});
