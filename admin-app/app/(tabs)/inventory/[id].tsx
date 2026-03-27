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
import { colors, spacing, typography } from '@/ui/theme';

/** Shape returned by GET /api/mobile/admin/inventory */
type InventoryListItem = {
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

export default function InventoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stockNew, setStockNew] = useState('');
  const [priceNew, setPriceNew] = useState('');

  const { data, isLoading, error } = useQuery<InventoryListItem>({
    queryKey: ['inventory-product', id],
    queryFn: async () => {
      const response = await apiClient.get<{ items: InventoryListItem[] }>(
        `/api/mobile/admin/inventory?status=active&perPage=200`,
      );
      const product = response.items.find((entry) => entry.productId === id);
      if (!product) throw new Error('Product not found');
      return product;
    },
    enabled: Boolean(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-product', id] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/mobile/admin/inventory/${id}`, {
        stockNew: Number(stockNew),
        priceNew: priceNew ? Number(priceNew) : null,
      }),
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/mobile/admin/inventory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      router.back();
    },
  });

  return (
    <Screen>
      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} />

      {data ? (
        <>
          <Card>
            <Text style={styles.title}>{data.brand} {data.pattern}</Text>
            <Text style={styles.meta}>{data.sizeDisplay} · {data.season}</Text>
            <Text style={styles.meta}>Stock: {data.stockNew ?? 0} · {data.priceNew ? `£${data.priceNew}` : 'No price'}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Update stock and price</Text>
            <InputField label="Stock" value={stockNew} onChangeText={setStockNew} placeholder={String(data.stockNew ?? 0)} keyboardType="numeric" />
            <InputField label="Price" value={priceNew} onChangeText={setPriceNew} placeholder={data.priceNew ?? '0'} keyboardType="decimal-pad" />
            <PrimaryButton
              title={saveMutation.isPending ? 'Saving...' : 'Save changes'}
              onPress={() => saveMutation.mutate()}
              disabled={!stockNew || saveMutation.isPending}
            />
          </Card>

          <Card>
            <Text style={styles.section}>Danger zone</Text>
            <PrimaryButton
              title={deleteMutation.isPending ? 'Deleting...' : 'Delete product'}
              variant="danger"
              disabled={deleteMutation.isPending}
              onPress={() => {
                Alert.alert('Delete product', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
                ]);
              }}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  section: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.size.sm,
  },
});
