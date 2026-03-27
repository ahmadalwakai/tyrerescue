import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusPill } from '@/ui/StatusPill';
import { colors } from '@/ui/theme';

type Slot = {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  maxBookings: number;
  active: boolean;
  occupancy: number;
};

type AvailabilityResponse = { slots: Slot[] };

export default function AvailabilityScreen() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');

  const { data, isLoading, error } = useQuery<AvailabilityResponse>({
    queryKey: ['availability'],
    queryFn: () => apiClient.get('/api/mobile/admin/availability'),
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/api/mobile/admin/availability', { date, timeStart, timeEnd, maxBookings: 1 }),
    onSuccess: () => {
      setDate('');
      setTimeStart('');
      setTimeEnd('');
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiClient.patch('/api/mobile/admin/availability', { id, active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Availability slots</Text>

      <Card>
        <Text style={styles.section}>Create slot</Text>
        <InputField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <InputField label="Start" value={timeStart} onChangeText={setTimeStart} placeholder="09:00" />
        <InputField label="End" value={timeEnd} onChangeText={setTimeEnd} placeholder="11:00" />
        <PrimaryButton
          title={createMutation.isPending ? 'Creating...' : 'Create slot'}
          onPress={() => createMutation.mutate()}
          disabled={!date || !timeStart || !timeEnd || createMutation.isPending}
        />
      </Card>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.slots?.length}
        emptyLabel="No slots configured"
      />

      {data?.slots?.map((slot) => (
        <Card key={slot.id}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.slot}>{slot.date} {slot.timeStart}-{slot.timeEnd}</Text>
              <Text style={styles.meta}>Occupancy {slot.occupancy}/{slot.maxBookings}</Text>
            </View>
            <StatusPill label={slot.active ? 'active' : 'inactive'} />
          </View>
          <PrimaryButton
            title={slot.active ? 'Deactivate' : 'Activate'}
            tone="neutral"
            onPress={() => toggleMutation.mutate({ id: slot.id, active: !slot.active })}
            disabled={toggleMutation.isPending}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  rowTop: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  slot: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  meta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
});
