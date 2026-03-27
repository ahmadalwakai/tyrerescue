import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from "@/ui/StatusPill";
import { colors } from '@/ui/theme';

type InventoryItem = {
  catalogueId: string;
  productId: string | null;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  tier: string;
  stockNew: number | null;
  priceNew: string | null;
};

type InventoryResponse = {
  items: InventoryItem[];
  totalCount: number;
};

export default function InventoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');

  const { data, isLoading, error } = useQuery<InventoryResponse>({
    queryKey: ['inventory', search, status],
    queryFn: () =>
      apiClient.get(
        `/api/mobile/admin/inventory?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`,
      ),
  });

  const activateMutation = useMutation({
    mutationFn: (catalogueId: string) => apiClient.post('/api/mobile/admin/inventory', { catalogueId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  });

  return (
    <Screen>
      <Text style={styles.title}>Inventory</Text>
      <InputField label="Search" value={search} onChangeText={setSearch} placeholder="Brand, pattern, size" />
      <InputField label="Status" value={status} onChangeText={setStatus} placeholder="active | inactive | all" />

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No products found"
      />

      {data?.items?.map((item) => (
        <View key={item.catalogueId} style={styles.row}>
          <Pressable style={{ flex: 1 }} onPress={() => item.productId && router.push(`/(tabs)/inventory/${item.productId}`)}>
            <Text style={styles.name}>{item.brand} {item.pattern}</Text>
            <Text style={styles.meta}>{item.sizeDisplay} • {item.season} • {item.tier}</Text>
            <Text style={styles.meta}>Stock: {item.stockNew ?? 0} • GBP {item.priceNew || '-'}</Text>
          </Pressable>
          {item.productId ? (
            <StatusChip status="active" />
          ) : (
            <PrimaryButton
              title={activateMutation.isPending ? '...' : 'Activate'}
              onPress={() => activateMutation.mutate(item.catalogueId)}
              disabled={activateMutation.isPending}
            />
          )}
        </View>
      ))}
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
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
});
