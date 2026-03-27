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
import { colors } from '@/ui/theme';

type InventoryProduct = {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  stockNew: number;
  priceNew: string | null;
};

export default function InventoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stockNew, setStockNew] = useState('');
  const [priceNew, setPriceNew] = useState('');

  const { data, isLoading, error } = useQuery<InventoryProduct>({
    queryKey: ['inventory-product', id],
    queryFn: async () => {
      const response = await apiClient.get<{ items: InventoryProduct[] }>(`/api/mobile/admin/inventory?status=active&perPage=200`);
      const product = response.items.find((entry) => entry.id === id || (entry as unknown as { productId?: string }).productId === id);
      if (!product) throw new Error('Product not found in active inventory payload');
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
            <Text style={styles.meta}>{data.sizeDisplay} • {data.season}</Text>
            <Text style={styles.meta}>Stock {data.stockNew} • GBP {data.priceNew || '-'}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Update stock and price</Text>
            <InputField label="Stock new" value={stockNew} onChangeText={setStockNew} placeholder={String(data.stockNew)} />
            <InputField label="Price new" value={priceNew} onChangeText={setPriceNew} placeholder={data.priceNew || '0'} />
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
              tone="danger"
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
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  meta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
});
