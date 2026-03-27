import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { Card } from '@/ui/Card';
import { StateView } from '@/ui/StateView';
import { colors } from '@/ui/theme';

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string | null;
  actorRole: string | null;
};

type AuditResponse = {
  items: AuditEntry[];
};

export default function AuditScreen() {
  const { data, isLoading, error } = useQuery<AuditResponse>({
    queryKey: ['insights-audit'],
    queryFn: () => apiClient.get('/api/mobile/admin/audit'),
  });

  return (
    <Screen>
      <Text style={styles.title}>Audit log</Text>
      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No audit records"
      />

      {data?.items?.map((entry) => (
        <Card key={entry.id}>
          <Text style={styles.action}>{entry.action}</Text>
          <Text style={styles.meta}>{entry.entityType}</Text>
          <Text style={styles.meta}>{entry.actorRole || 'system'}</Text>
          <Text style={styles.meta}>{entry.createdAt || ''}</Text>
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
  action: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
});
