import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { colors } from '@/ui/theme';

type Rule = {
  id: string;
  key: string;
  value: string;
  label: string | null;
};

type ContentResponse = {
  items: Rule[];
};

export default function ContentScreen() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const { data, isLoading, error } = useQuery<ContentResponse>({
    queryKey: ['cms-content'],
    queryFn: () => apiClient.get('/api/mobile/admin/content'),
  });

  const saveMutation = useMutation({
    mutationFn: () => apiClient.put('/api/mobile/admin/content', { items: [{ key, value }] }),
    onSuccess: () => {
      setKey('');
      setValue('');
      queryClient.invalidateQueries({ queryKey: ['cms-content'] });
    },
  });

  return (
    <Screen>
      <Text style={styles.title}>Pricing and content rules</Text>

      <Card>
        <InputField label="Rule key" value={key} onChangeText={setKey} placeholder="vat_rate" />
        <InputField label="Rule value" value={value} onChangeText={setValue} placeholder="20" />
        <PrimaryButton
          title={saveMutation.isPending ? 'Saving...' : 'Save rule'}
          onPress={() => saveMutation.mutate()}
          disabled={!key || !value || saveMutation.isPending}
        />
      </Card>

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No rules found"
      />

      {data?.items?.slice(0, 80).map((item) => (
        <Card key={item.id}>
          <Text style={styles.key}>{item.key}</Text>
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.label}>{item.label || '-'}</Text>
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
  key: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  value: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  label: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 11,
  },
});
