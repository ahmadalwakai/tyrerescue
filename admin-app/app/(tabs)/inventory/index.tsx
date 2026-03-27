import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Screen } from '@/ui/Screen';
import { InputField } from '@/ui/InputField';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { StateView } from '@/ui/StateView';
import { StatusChip } from '@/ui/StatusPill';
import { ListRow } from '@/ui/ListRow';
import { SectionHeader } from '@/ui/SectionHeader';
import { colors, radius, spacing } from '@/ui/theme';

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
      <InputField label="Search" value={search} onChangeText={setSearch} placeholder="Brand, pattern, or size" />
      <InputField label="Filter" value={status} onChangeText={setStatus} placeholder="active, inactive, or all" />

      <StateView
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        empty={!data?.items?.length}
        emptyLabel="No products found"
      />

      {data?.items && data.items.length > 0 && (
        <>
          <SectionHeader
            title="Products"
            subtitle={data.totalCount ? `${data.totalCount} total` : undefined}
          />
          <View style={styles.list}>
            {data.items.map((item, index) => (
              <ListRow
                key={item.catalogueId}
                title={`${item.brand} ${item.pattern}`}
                subtitle={`${item.sizeDisplay} · Stock: ${item.stockNew ?? 0}`}
                rightContent={
                  item.productId ? (
                    (item.stockNew ?? 0) === 0 ? (
                      <StatusChip status="out_of_stock" label="Out of stock" />
                    ) : (
                      <StatusChip status="active" />
                    )
                  ) : (
                    <PrimaryButton
                      title={activateMutation.isPending ? '...' : 'Activate'}
                      onPress={() => activateMutation.mutate(item.catalogueId)}
                      disabled={activateMutation.isPending}
                      size="sm"
                    />
                  )
                }
                onPress={
                  item.productId
                    ? () => router.push(`/(tabs)/inventory/${item.productId}`)
                    : undefined
                }
                divider={index < data.items.length - 1}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
});
