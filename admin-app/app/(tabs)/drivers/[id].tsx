import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type DriverDetail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  totalJobs: number;
  completedJobs: number;
  activeJobs: number;
};

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading, error } = useQuery<DriverDetail>({
    queryKey: ['driver', id],
    queryFn: () => apiClient.get(`/api/mobile/admin/drivers/${id}`),
    enabled: Boolean(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['driver', id] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  const updateMutation = useMutation({
    mutationFn: () => apiClient.put(`/api/mobile/admin/drivers/${id}`, { status }),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/mobile/admin/drivers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      router.back();
    },
  });

  const onDelete = () => {
    Alert.alert('Delete driver', 'This will permanently delete the driver account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  return (
    <Screen>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.name}>{data.name}</Text>
            <StatusPill label={data.status} />
            <Text style={styles.meta}>{data.email}</Text>
            <Text style={styles.meta}>{data.phone || 'No phone'}</Text>
            <Text style={styles.meta}>Total jobs: {data.totalJobs}</Text>
            <Text style={styles.meta}>Completed: {data.completedJobs}</Text>
            <Text style={styles.meta}>Active: {data.activeJobs}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Update status</Text>
            <InputField
              label="Status"
              value={status}
              onChangeText={setStatus}
              placeholder="offline | available | en_route | arrived | in_progress"
            />
            <PrimaryButton
              title={updateMutation.isPending ? 'Updating...' : 'Save'}
              onPress={() => updateMutation.mutate()}
              disabled={!status || updateMutation.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Danger zone</Text>
            <PrimaryButton
              title={deleteMutation.isPending ? 'Deleting...' : 'Delete driver'}
              onPress={onDelete}
              tone="danger"
              disabled={deleteMutation.isPending}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  meta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
});
