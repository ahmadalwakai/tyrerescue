import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { colors } from '@/ui/theme';

type PricingResponse = {
  rules: Array<{ id: string; key: string; value: string; label: string | null }>;
  config: {
    manualSurchargePercent: string;
    manualSurchargeActive: boolean;
    maxTotalSurchargePercent: string;
  };
};

export default function PricingScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<PricingResponse>({
    queryKey: ['pricing'],
    queryFn: () => apiClient.get('/api/mobile/admin/pricing'),
  });

  const [ruleValue, setRuleValue] = useState('');
  const [manualPercent, setManualPercent] = useState('');

  const firstRule = useMemo(() => data?.rules?.[0], [data]);

  const updateRule = useMutation({
    mutationFn: () => apiClient.patch('/api/mobile/admin/pricing', { id: firstRule?.id, value: ruleValue }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing'] }),
  });

  const updateConfig = useMutation({
    mutationFn: () =>
      apiClient.patch('/api/mobile/admin/pricing', {
        config: {
          manualSurchargePercent: Number(manualPercent),
          manualSurchargeActive: true,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Pricing controls</Text>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.section}>Dynamic surcharge config</Text>
            <Text style={styles.meta}>Manual active: {String(data.config.manualSurchargeActive)}</Text>
            <Text style={styles.meta}>Manual percent: {data.config.manualSurchargePercent}%</Text>
            <InputField
              label="Set manual surcharge percent"
              value={manualPercent}
              onChangeText={setManualPercent}
              placeholder={data.config.manualSurchargePercent}
            />
            <PrimaryButton
              title={updateConfig.isPending ? 'Saving...' : 'Apply surcharge'}
              onPress={() => updateConfig.mutate()}
              disabled={!manualPercent || updateConfig.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.section}>Rule quick edit</Text>
            <Text style={styles.meta}>Editing first rule: {firstRule?.key || 'No rules'}</Text>
            <InputField
              label="Rule value"
              value={ruleValue}
              onChangeText={setRuleValue}
              placeholder={firstRule?.value || ''}
            />
            <PrimaryButton
              title={updateRule.isPending ? 'Updating...' : 'Update rule'}
              onPress={() => updateRule.mutate()}
              disabled={!firstRule || !ruleValue || updateRule.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.section}>Current rules</Text>
            {data.rules.slice(0, 20).map((rule) => (
              <Text key={rule.id} style={styles.meta}>{rule.key}: {rule.value}</Text>
            ))}
          </Card>
        </>
      ) : null}
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
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
});
