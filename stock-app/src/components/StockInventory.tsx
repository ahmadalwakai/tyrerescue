import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/theme';
import type { InventoryItem, InventorySummary, StockSeasonFilter, StockSortOption, TyreSeason } from '@/types';
import { Button, EmptyState, Message } from './StockPrimitives';

export interface StockInventoryProps {
  items: InventoryItem[];
  summary: InventorySummary | null;
  search: string;
  onSearchChange: (value: string) => void;
  season: StockSeasonFilter;
  onSeasonChange: (value: StockSeasonFilter) => void;
  sort: StockSortOption;
  onSortChange: (value: StockSortOption) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasLoaded: boolean;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (item: InventoryItem) => void;
  onMissing: (size: string) => Promise<void>;
  canRecordMissing: boolean;
  missingSaving: boolean;
  onSeasonEdit?: (item: InventoryItem, season: TyreSeason) => Promise<void>;
  canManage: boolean;
}

const seasons: { value: StockSeasonFilter; label: string }[] = [
  { value: 'all', label: 'All types' }, { value: 'summer', label: 'Summer' },
  { value: 'winter', label: 'Winter' }, { value: 'allseason', label: 'All season' },
];
const sorts: { value: StockSortOption; label: string }[] = [
  { value: 'size', label: 'Size' }, { value: 'brand', label: 'Brand' },
  { value: 'stock', label: 'Available stock' }, { value: 'season', label: 'Type' },
];

function seasonLabel(season: TyreSeason | null) {
  return season === 'summer' ? 'Summer' : season === 'winter' ? 'Winter' : season === 'allseason' ? 'All season' : 'Type not set';
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, warning && { color: colors.warning }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export function StockInventory({ items, summary, search, onSearchChange, season, onSeasonChange, sort, onSortChange, loading, loadingMore, error, hasLoaded, totalCount, hasMore, onLoadMore, onRetry, onSelect, onMissing, canRecordMissing, missingSaving }: StockInventoryProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [requestedSize, setRequestedSize] = useState<string | null>(null);
  const [missingError, setMissingError] = useState<{ size: string; message: string } | null>(null);
  const missingInFlight = useRef(false);
  const query = search.trim();
  const filtersActive = season !== 'all' || sort !== 'size';

  async function requestMissing() {
    if (missingInFlight.current || missingSaving || !canRecordMissing || !hasLoaded || loading || error || items.length || season !== 'all' || query.length < 3) return;
    missingInFlight.current = true;
    setMissingError(null);
    try {
      await onMissing(query);
      setRequestedSize(query);
    } catch (err) {
      setMissingError({ size: query, message: err instanceof Error ? err.message : 'Could not send the request. Please try again.' });
    } finally {
      missingInFlight.current = false;
    }
  }

  const renderItem = useCallback(({ item }: { item: InventoryItem }) => {
    const outOfStock = item.availableStock <= 0;
    const low = !outOfStock && item.availableStock <= item.minStock;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.product.sizeDisplay}, ${item.product.brand} ${item.product.pattern}, ${item.availableStock} available. View stock actions.`}
        accessibilityState={{ disabled: loading || Boolean(error) }}
        disabled={loading || Boolean(error)}
        onPress={() => onSelect(item)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, (loading || Boolean(error)) && { opacity: 0.55 }]}
      >
        <View style={styles.rowMain}>
          <Text style={styles.size}>{item.product.sizeDisplay}</Text>
          <Text style={styles.brand}>{item.product.brand} {item.product.pattern}</Text>
          <View style={styles.rowMeta}>
            <Text style={styles.type}>{seasonLabel(item.product.season)}</Text>
            {item.reservedStock > 0 ? <Text style={styles.reserved}>{item.reservedStock} reserved</Text> : null}
          </View>
          {outOfStock || low ? <Text style={[styles.status, { color: outOfStock ? colors.danger : colors.warning }]}>{outOfStock ? 'Out of stock' : 'Low stock'}</Text> : null}
        </View>
        <View style={styles.quantity}>
          <Text style={[styles.quantityValue, (outOfStock || low) && { color: outOfStock ? colors.danger : colors.warning }]}>{item.availableStock}</Text>
          <Text style={styles.quantityLabel}>available</Text>
          {item.product.priceNew !== null ? <Text style={styles.price}>£{Number(item.product.priceNew).toFixed(2)}</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
      </Pressable>
    );
  }, [error, loading, onSelect]);

  const header = (
    <View style={styles.header}>
      <View style={styles.headingRow}><Text style={styles.heading}>City inventory</Text>{summary ? <Text style={styles.caption}>{summary.totalProducts} products</Text> : null}</View>
      {summary ? (
        <View style={styles.summary}>
          <Metric label="Current" value={summary.current} />
          <Metric label="Available" value={summary.available} />
          <Metric label="Reserved" value={summary.reserved} />
          <Metric label="To buy" value={summary.toBuy} warning={summary.toBuy > 0} />
        </View>
      ) : null}
      <Text style={styles.label}>Find a tyre</Text>
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
        <TextInput accessibilityLabel="Search stock by tyre size, brand or pattern" value={search} onChangeText={onSearchChange} placeholder="Size, brand or pattern" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" selectionColor={colors.primary} style={styles.searchInput} />
        {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onSearchChange('')} style={styles.clear}><MaterialCommunityIcons name="close-circle" size={21} color={colors.muted} /></Pressable> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((open) => !open)} style={styles.filterToggle}>
        <MaterialCommunityIcons name="tune-variant" size={19} color={filtersActive ? colors.primary : colors.muted} />
        <Text style={[styles.filterToggleText, filtersActive && { color: colors.primary }]}>Filter and sort{filtersActive ? ' · applied' : ''}</Text>
        <MaterialCommunityIcons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {filtersOpen ? (
        <View style={styles.filters}>
          <Text style={styles.label}>Tyre type</Text>
          <View style={styles.chips}>{seasons.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: season === option.value }} onPress={() => onSeasonChange(option.value)} style={[styles.chip, season === option.value && styles.chipSelected]}><Text style={[styles.chipText, season === option.value && styles.chipTextSelected]}>{option.label}</Text></Pressable>)}</View>
          <Text style={styles.label}>Sort by</Text>
          <View style={styles.chips}>{sorts.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: sort === option.value }} onPress={() => onSortChange(option.value)} style={[styles.chip, sort === option.value && styles.chipSelected]}><Text style={[styles.chipText, sort === option.value && styles.chipTextSelected]}>{option.label}</Text></Pressable>)}</View>
          {filtersActive ? <Button title="Reset filters" onPress={() => { onSeasonChange('all'); onSortChange('size'); }} /> : null}
        </View>
      ) : null}
      {error && items.length > 0 ? <View style={styles.errorGroup}><Message text={error} tone="error" /><Button title="Retry stock refresh" onPress={onRetry} icon="refresh" /></View> : null}
      <View style={styles.resultLine}>
        <Text style={styles.caption}>{loading ? 'Updating stock…' : hasLoaded && !error ? `${totalCount} ${query || season !== 'all' ? 'matching ' : ''}${totalCount === 1 ? 'product' : 'products'}` : 'Stock results'}</Text>
        {loading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>
    </View>
  );

  const empty = loading || !hasLoaded && !error ? (
    <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.caption}>Loading inventory…</Text></View>
  ) : error ? (
    <EmptyState title="Stock could not be loaded" description={error} onRetry={onRetry} />
  ) : (
    <View>
      <EmptyState title={query || season !== 'all' ? 'No matching tyres' : 'No inventory yet'} description={season !== 'all' ? 'Try all tyre types or change your search.' : query ? 'Check the size or try searching by brand.' : 'No products are recorded for this city.'} />
      {season !== 'all' ? <Button title="Search all tyre types" onPress={() => onSeasonChange('all')} /> : null}
      {canRecordMissing && query.length >= 3 && season === 'all' ? (
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Need this size?</Text>
          <Text style={styles.caption}>Send a missing tyre request for “{query}”.</Text>
          {requestedSize === query ? <Message text="Missing tyre request recorded." tone="success" /> : <Button title={missingSaving ? 'Sending request…' : 'Request missing tyre'} icon="clipboard-alert-outline" onPress={() => { void requestMissing(); }} disabled={missingSaving} />}
          {missingError?.size === query ? <Message text={missingError.message} tone="error" /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.balanceId}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={items.length > 0 ? <View style={styles.footer}>{loadingMore ? <ActivityIndicator color={colors.primary} /> : null}{hasMore ? <Button title={loadingMore ? 'Loading more…' : `Load more · ${items.length} of ${totalCount}`} onPress={onLoadMore} disabled={loading || loadingMore || Boolean(error)} /> : <Text style={styles.caption}>{items.length} of {totalCount} products shown</Text>}</View> : null}
      ItemSeparatorComponent={Separator}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshing={loading}
      onRefresh={onRetry}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
    />
  );
}

function Separator() { return <View style={styles.separator} />; }

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 12, paddingBottom: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flex: 1, minWidth: 68, padding: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: 4 },
  metricValue: { color: colors.text, fontSize: 21, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  search: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.panel },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, color: colors.text, fontSize: 16, paddingVertical: 10 },
  clear: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  filterToggle: { flexDirection: 'row', minHeight: 44, alignItems: 'center', gap: 8 },
  filterToggleText: { flex: 1, color: colors.muted, fontSize: 14, fontWeight: '600' },
  filters: { padding: 12, gap: 12, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: colors.primary },
  resultLine: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  errorGroup: { gap: 8 },
  row: { padding: 16, minHeight: 116, backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowPressed: { backgroundColor: colors.panelSoft, borderColor: colors.primary },
  rowMain: { flex: 1, minWidth: 0, gap: 5 },
  size: { color: colors.text, fontSize: 17, fontWeight: '800' },
  brand: { color: colors.text, fontSize: 13, lineHeight: 19 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { color: colors.muted, fontSize: 12 },
  reserved: { color: colors.warning, fontSize: 12 },
  status: { fontSize: 12, fontWeight: '700' },
  quantity: { alignItems: 'flex-end', gap: 3 },
  quantityValue: { color: colors.success, fontSize: 25, fontWeight: '800' },
  quantityLabel: { color: colors.muted, fontSize: 11 },
  price: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 3 },
  separator: { height: 10 },
  loading: { padding: 30, alignItems: 'center', gap: 12 },
  missing: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 12 },
  missingTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  footer: { paddingVertical: 20, gap: 12, alignItems: 'stretch' },
});
