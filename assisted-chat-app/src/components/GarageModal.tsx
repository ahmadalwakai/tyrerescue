import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { api } from '@/lib/api';
import { colors, fontSize, radius, space } from './theme';
import { AppIcon, type AppIconName } from './icons/AppIcon';
import { AdminHeaderButton, AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';

interface GarageCity {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

interface GarageSummary {
  products: number;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  orderedStock: number;
  toBuy: number;
  reduced: number;
  added: number;
}

interface GarageToBuyItem {
  tyreProductId: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  currentStock: number;
  reservedStock: number;
  orderedStock: number;
  minStock: number;
  targetStock: number;
  suggestedBuy: number;
  recentReduced: number;
  buyQuantity: number;
  lastReducedAt: string | null;
  reducedBy: string | null;
}

interface GarageMissingTyre {
  normalizedSize: string;
  requestCount: number;
  lastRequestedAt: string | null;
  requestedBy: string | null;
}

interface GarageMovement {
  id: string;
  movementType: string;
  quantityDelta: number;
  quantity: number;
  resultingBalance: number;
  saleChannel: string | null;
  reason: string | null;
  note: string | null;
  occurredAt: string | null;
  actor: {
    id: string | null;
    name: string;
    email: string | null;
    role: string | null;
  };
  shift: {
    id: string | null;
    startedAt: string | null;
  };
  booking: {
    id: string | null;
    refNumber: string | null;
  };
  product: {
    id: string;
    brand: string;
    pattern: string;
    sizeDisplay: string;
  };
}

interface GarageShift {
  id: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  cityId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  adminOverrideReason: string | null;
  saleCount: number;
  tyresSold: number;
}

interface GarageResponse {
  cities: GarageCity[];
  selectedCityId: string | null;
  days: number;
  summary: GarageSummary;
  toBuy: GarageToBuyItem[];
  missingTyres: GarageMissingTyre[];
  reductions: GarageMovement[];
  additions: GarageMovement[];
  shifts: GarageShift[];
}

interface StockSearchItem {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  stockNew: number;
  availableNew: boolean;
}

interface StockSearchResponse {
  items: StockSearchItem[];
}

interface GarageModalProps {
  visible: boolean;
  onClose: () => void;
}

type GaragePanel = 'menu' | 'add-city' | 'add-size' | null;
type StatTone = 'orange' | 'blue' | 'green' | 'red' | 'neutral';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const cardShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 28px rgba(0,0,0,0.24)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.24,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }
) as ViewStyle;

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return DATE_TIME.format(date);
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '—';
  const mins = Math.max(0, Math.round((to - from) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function saleChannelLabel(value: string | null): string {
  if (value === 'EMERGENCY_CALL_OUT') return 'Emergency';
  if (value === 'GARAGE') return 'Garage';
  return 'Stock';
}

function movementLabel(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function selectedCityName(data: GarageResponse | null): string {
  if (!data?.selectedCityId) return 'No city';
  return data.cities.find((city) => city.id === data.selectedCityId)?.name ?? 'Selected city';
}

function slugFromCityName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (/^[a-z]/.test(slug)) return slug.slice(0, 100);
  return slug ? `city-${slug}`.slice(0, 100) : '';
}

function intFromText(value: string): number {
  const parsed = Number.parseInt(value.trim() || '0', 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function EmptyState({ icon, title, text }: { icon: AppIconName; title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={18} color={colors.subtle} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    </View>
  );
}

const STAT_TONE_COLOR: Record<StatTone, string> = {
  orange: colors.accent,
  blue: colors.blue,
  green: colors.success,
  red: colors.danger,
  neutral: colors.subtle,
};

function StatPill({ label, value, tone, icon }: { label: string; value: number; tone: StatTone; icon: AppIconName }) {
  const toneColor = STAT_TONE_COLOR[tone];
  return (
    <View style={[styles.statPill, styles[`statPill_${tone}`]]}>
      <View style={styles.statTopRow}>
        <View style={[styles.statIconShell, styles[`statIconShell_${tone}`]]}>
          <AppIcon name={icon} size={12} color={toneColor} />
        </View>
        <Text style={[styles.statValue, { color: toneColor }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function HeaderIconButton({ label, icon, onPress, active }: { label: string; icon: AppIconName; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerIconButton,
        active && styles.headerIconButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} size={18} color={active ? colors.accent : colors.text} />
    </Pressable>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function MenuOption({
  icon,
  title,
  text,
  onPress,
}: {
  icon: AppIconName;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuOption, pressed && styles.pressed]}>
      <View style={styles.menuOptionIcon}>
        <AppIcon name={icon} size={16} color={colors.accent} />
      </View>
      <View style={styles.menuOptionCopy}>
        <Text style={styles.menuOptionTitle}>{title}</Text>
        <Text style={styles.menuOptionText}>{text}</Text>
      </View>
      <AppIcon name="angle-right" size={20} color={colors.subtle} />
    </Pressable>
  );
}

function IdeaChip({ icon, text }: { icon: AppIconName; text: string }) {
  return (
    <View style={styles.ideaChip}>
      <AppIcon name={icon} size={13} color={colors.info} />
      <Text style={styles.ideaChipText}>{text}</Text>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string | number | null }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value ?? '—'}</Text>
    </View>
  );
}

function ToBuyCard({ item }: { item: GarageToBuyItem }) {
  const source = item.suggestedBuy > 0
    ? `Target says buy ${item.suggestedBuy}`
    : `Recent reductions ${item.recentReduced}`;
  return (
    <View style={[styles.buyCard, cardShadow]}>
      <View style={styles.buyTop}>
        <View style={styles.buyQty}>
          <Text style={styles.buyQtyLabel}>BUY</Text>
          <Text style={styles.buyQtyValue}>{item.buyQuantity}</Text>
        </View>
        <View style={styles.buyCopy}>
          <Text style={styles.buyTitle}>{item.sizeDisplay}</Text>
          <Text style={styles.buyMeta}>{item.brand} {item.pattern}</Text>
          <Text style={styles.buyHint}>{source}</Text>
        </View>
      </View>
      <View style={styles.detailGrid}>
        <DetailLine label="Current" value={item.currentStock} />
        <DetailLine label="Ordered" value={item.orderedStock} />
        <DetailLine label="Target" value={item.targetStock} />
        <DetailLine label="Reduced by" value={item.reducedBy || '—'} />
      </View>
    </View>
  );
}

function MissingCard({ item }: { item: GarageMissingTyre }) {
  return (
    <View style={styles.missingCard}>
      <View>
        <Text style={styles.missingSize}>{item.normalizedSize}</Text>
        <Text style={styles.missingMeta}>Requested by {item.requestedBy || 'Unknown'}</Text>
      </View>
      <View style={styles.missingCount}>
        <Text style={styles.missingCountValue}>{item.requestCount}</Text>
        <Text style={styles.missingCountLabel}>requests</Text>
      </View>
    </View>
  );
}

function MovementCard({ item, mode }: { item: GarageMovement; mode: 'reduced' | 'added' }) {
  const positive = mode === 'added';
  return (
    <View style={styles.movementCard}>
      <View style={[styles.movementIcon, positive ? styles.movementIconAdd : styles.movementIconReduce]}>
        <AppIcon name={positive ? 'plus' : 'minus'} size={14} color={positive ? colors.success : colors.danger} />
      </View>
      <View style={styles.movementCopy}>
        <View style={styles.movementTop}>
          <Text style={styles.movementTitle}>{item.product.sizeDisplay}</Text>
          <Text style={[styles.movementQty, positive ? styles.qtyAdd : styles.qtyReduce]}>
            {positive ? '+' : '-'}{item.quantity}
          </Text>
        </View>
        <Text style={styles.movementMeta}>
          {item.product.brand} {item.product.pattern} · {movementLabel(item.movementType)}
        </Text>
        <Text style={styles.movementMeta}>
          By {item.actor.name} · {saleChannelLabel(item.saleChannel)} · {formatDateTime(item.occurredAt)}
        </Text>
        {item.booking.refNumber ? (
          <Text style={styles.movementNote}>Booking #{item.booking.refNumber}</Text>
        ) : null}
        {item.reason || item.note ? (
          <Text style={styles.movementNote}>{item.reason || item.note}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ShiftCard({ item }: { item: GarageShift }) {
  const active = item.status === 'active' && !item.endedAt;
  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftTop}>
        <View>
          <Text style={styles.shiftName}>{item.userName}</Text>
          <Text style={styles.shiftEmail}>{item.userEmail || 'No email'}</Text>
        </View>
        <View style={[styles.shiftBadge, active ? styles.shiftBadgeActive : styles.shiftBadgeEnded]}>
          <Text style={[styles.shiftBadgeText, active ? styles.shiftBadgeTextActive : styles.shiftBadgeTextEnded]}>
            {active ? 'Active' : 'Ended'}
          </Text>
        </View>
      </View>
      <View style={styles.detailGrid}>
        <DetailLine label="Started" value={formatDateTime(item.startedAt)} />
        <DetailLine label="Ended" value={active ? 'Still open' : formatDateTime(item.endedAt)} />
        <DetailLine label="Duration" value={formatDuration(item.startedAt, item.endedAt)} />
        <DetailLine label="Tyres sold" value={item.tyresSold} />
      </View>
      {item.adminOverrideReason ? (
        <Text style={styles.shiftOverride}>Admin override: {item.adminOverrideReason}</Text>
      ) : null}
    </View>
  );
}

export function GarageModal({ visible, onClose }: GarageModalProps) {
  const [data, setData] = useState<GarageResponse | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingCityId, setRefreshingCityId] = useState<string | null>(null);
  const [panel, setPanel] = useState<GaragePanel>(null);
  const [cityNameInput, setCityNameInput] = useState('');
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [citySuccess, setCitySuccess] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<StockSearchItem[]>([]);
  const [stockSelected, setStockSelected] = useState<StockSearchItem | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSuccess, setStockSuccess] = useState<string | null>(null);
  const [initialUnits, setInitialUnits] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [targetStock, setTargetStock] = useState('4');
  const [orderedStock, setOrderedStock] = useState('0');

  const load = useCallback(async (cityId: string | null = selectedCityId) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: '14' });
      if (cityId) params.set('cityId', cityId);
      const result = await api.get<GarageResponse>(`/api/stock/garage?${params.toString()}`);
      setData(result);
      setSelectedCityId(result.selectedCityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Garage');
    } finally {
      setLoading(false);
      setRefreshingCityId(null);
    }
  }, [selectedCityId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const cityLabel = useMemo(() => selectedCityName(data), [data]);
  const generatedCitySlug = useMemo(() => slugFromCityName(cityNameInput), [cityNameInput]);

  const chooseCity = useCallback((cityId: string) => {
    setSelectedCityId(cityId);
    setRefreshingCityId(cityId);
    void load(cityId);
  }, [load]);

  const summary = data?.summary;

  const toggleMenu = useCallback(() => {
    setPanel((current) => (current === 'menu' ? null : 'menu'));
  }, []);

  const openPanel = useCallback((next: Exclude<GaragePanel, 'menu' | null>) => {
    setPanel(next);
    setError(null);
    setCityError(null);
    setCitySuccess(null);
    setStockError(null);
    setStockSuccess(null);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setCityError(null);
    setCitySuccess(null);
    setStockError(null);
    setStockSuccess(null);
  }, []);

  const handleCreateCity = useCallback(async () => {
    const name = cityNameInput.trim();
    const slug = generatedCitySlug;
    setCityError(null);
    setCitySuccess(null);
    if (name.length < 2) {
      setCityError('Enter a city name.');
      return;
    }
    if (!slug || slug.length < 3) {
      setCityError('City slug must be at least 3 URL-safe characters.');
      return;
    }
    setCityBusy(true);
    try {
      const result = await api.post<{ item: GarageCity & { roleInCity?: string | null } }>('/api/stock/cities', {
        name,
        slug,
        grantCurrentUserAccess: true,
      });
      setCityNameInput('');
      setCitySuccess(`${result.item.name} created.`);
      await load(result.item.id);
      setPanel(null);
    } catch (err) {
      setCityError(err instanceof Error ? err.message : 'Failed to create city.');
    } finally {
      setCityBusy(false);
    }
  }, [cityNameInput, generatedCitySlug, load]);

  const handleSearchStock = useCallback(async () => {
    const query = stockSearch.trim();
    setStockError(null);
    setStockSuccess(null);
    if (query.length < 2) {
      setStockError('Enter at least 2 characters to search tyre stock.');
      return;
    }
    setStockBusy(true);
    try {
      const params = new URLSearchParams({ search: query, perPage: '8', available: 'true' });
      const result = await api.get<StockSearchResponse>(`/api/stock/products?${params.toString()}`);
      setStockResults(result.items);
      if (!result.items.length) setStockError('No matching tyre product found.');
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Failed to search stock.');
    } finally {
      setStockBusy(false);
    }
  }, [stockSearch]);

  const handleAddSizeToCity = useCallback(async () => {
    if (!data?.selectedCityId) {
      setStockError('Select a city first.');
      return;
    }
    if (!stockSelected) {
      setStockError('Select a tyre size first.');
      return;
    }
    const quantity = intFromText(initialUnits);
    setStockBusy(true);
    setStockError(null);
    setStockSuccess(null);
    try {
      await api.post(`/api/stock/cities/${data.selectedCityId}/inventory`, {
        tyreProductId: stockSelected.id,
        minStock: intFromText(minStock),
        targetStock: intFromText(targetStock),
        orderedStock: intFromText(orderedStock),
      });
      if (quantity > 0) {
        await api.post('/api/stock/movements', {
          cityId: data.selectedCityId,
          tyreProductId: stockSelected.id,
          movementType: 'RECEIVED',
          quantityDelta: quantity,
          reason: 'garage_add_size',
          note: `Added from Garage screen: ${stockSelected.sizeDisplay}`,
          idempotencyKey: `garage-add-${data.selectedCityId}-${stockSelected.id}-${Date.now()}`,
        });
      }
      setStockSuccess(`${stockSelected.sizeDisplay} added to ${cityLabel}.`);
      setStockSearch('');
      setStockResults([]);
      setStockSelected(null);
      setInitialUnits('0');
      await load(data.selectedCityId);
      setPanel(null);
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Failed to add size to stock.');
    } finally {
      setStockBusy(false);
    }
  }, [cityLabel, data?.selectedCityId, initialUnits, load, minStock, orderedStock, stockSelected, targetStock]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell keyboardAvoidingEnabled={false} chrome="plain">
        <AdminModalHeader
          title="Garage"
          subtitle={`${cityLabel} · last 14 days`}
          onClose={onClose}
          actions={
            <>
              <HeaderIconButton label="Garage options" icon="ellipsis-v" onPress={toggleMenu} active={panel === 'menu'} />
              <AdminHeaderButton
                label={loading ? 'Loading...' : 'Refresh'}
                onPress={() => { void load(); }}
                disabled={loading}
              />
            </>
          }
        />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {panel === 'menu' ? (
            <View style={styles.actionPanel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>Garage options</Text>
                  <Text style={styles.panelSubtitle}>Quick admin actions for city stock.</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={closePanel} style={styles.panelClose}>
                  <AppIcon name="times" size={14} color={colors.subtle} />
                </Pressable>
              </View>
              <View style={styles.menuStack}>
                <MenuOption
                  icon="map-marker"
                  title="Add City"
                  text="Create a new stock city and give this admin manager access."
                  onPress={() => openPanel('add-city')}
                />
                <MenuOption
                  icon="plus-circle"
                  title="Add size to the stock"
                  text="Attach an existing tyre product to this city and set stock targets."
                  onPress={() => openPanel('add-size')}
                />
              </View>
              <View style={styles.ideaBlock}>
                <Text style={styles.ideaTitle}>Suggested next ideas</Text>
                <View style={styles.ideaRow}>
                  <IdeaChip icon="shopping-cart" text="Purchase order from To buy" />
                  <IdeaChip icon="users" text="City staff access" />
                  <IdeaChip icon="download" text="Export Garage report" />
                  <IdeaChip icon="bell-o" text="Low-stock alerts" />
                </View>
              </View>
            </View>
          ) : null}

          {panel === 'add-city' ? (
            <View style={styles.actionPanel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>Add City</Text>
                  <Text style={styles.panelSubtitle}>Create a separate stock location.</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close Add City" onPress={closePanel} style={styles.panelClose}>
                  <AppIcon name="times" size={14} color={colors.subtle} />
                </Pressable>
              </View>
              <View style={styles.formStack}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>CITY NAME</Text>
                  <TextInput
                    value={cityNameInput}
                    onChangeText={setCityNameInput}
                    placeholder="Eg. Glasgow"
                    placeholderTextColor={colors.subtle}
                    autoCapitalize="words"
                    style={styles.input}
                  />
                  <Text style={styles.helperText}>Slug: {generatedCitySlug || 'enter-city-name'}</Text>
                </View>
                {cityError ? <Text style={styles.formError}>{cityError}</Text> : null}
                {citySuccess ? <Text style={styles.formSuccess}>{citySuccess}</Text> : null}
                <Pressable
                  onPress={handleCreateCity}
                  disabled={cityBusy}
                  style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, cityBusy && styles.disabledAction]}
                >
                  {cityBusy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryActionText}>Create city</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}

          {panel === 'add-size' ? (
            <View style={styles.actionPanel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>Add size to the stock</Text>
                  <Text style={styles.panelSubtitle}>Selected city: {cityLabel}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close Add size" onPress={closePanel} style={styles.panelClose}>
                  <AppIcon name="times" size={14} color={colors.subtle} />
                </Pressable>
              </View>
              <View style={styles.formStack}>
                <View style={styles.searchRow}>
                  <TextInput
                    value={stockSearch}
                    onChangeText={setStockSearch}
                    placeholder="Search 225/45 R17, Michelin..."
                    placeholderTextColor={colors.subtle}
                    autoCapitalize="characters"
                    style={[styles.input, styles.searchInput]}
                    onSubmitEditing={handleSearchStock}
                  />
                  <Pressable
                    onPress={handleSearchStock}
                    disabled={stockBusy}
                    style={({ pressed }) => [styles.searchButton, pressed && styles.pressed, stockBusy && styles.disabledAction]}
                  >
                    {stockBusy ? <ActivityIndicator color={colors.accentText} /> : <AppIcon name="search" size={15} color={colors.accentText} />}
                  </Pressable>
                </View>
                {stockResults.length ? (
                  <View style={styles.stockResults}>
                    {stockResults.map((item) => {
                      const selected = stockSelected?.id === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => setStockSelected(item)}
                          style={({ pressed }) => [
                            styles.stockResult,
                            selected && styles.stockResultSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.stockResultCopy}>
                            <Text style={styles.stockResultSize}>{item.sizeDisplay}</Text>
                            <Text style={styles.stockResultMeta}>{item.brand} {item.pattern} · {item.season}</Text>
                          </View>
                          <Text style={styles.stockResultQty}>{item.stockNew}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.inlineFields}>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>UNITS</Text>
                    <TextInput value={initialUnits} onChangeText={setInitialUnits} keyboardType="numeric" style={styles.input} placeholder="0" placeholderTextColor={colors.subtle} />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>MIN</Text>
                    <TextInput value={minStock} onChangeText={setMinStock} keyboardType="numeric" style={styles.input} placeholder="0" placeholderTextColor={colors.subtle} />
                  </View>
                </View>
                <View style={styles.inlineFields}>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>TARGET</Text>
                    <TextInput value={targetStock} onChangeText={setTargetStock} keyboardType="numeric" style={styles.input} placeholder="4" placeholderTextColor={colors.subtle} />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>ORDERED</Text>
                    <TextInput value={orderedStock} onChangeText={setOrderedStock} keyboardType="numeric" style={styles.input} placeholder="0" placeholderTextColor={colors.subtle} />
                  </View>
                </View>
                <Text style={styles.helperText}>If the tyre product does not exist yet, create it from the main Stock screen first.</Text>
                {stockError ? <Text style={styles.formError}>{stockError}</Text> : null}
                {stockSuccess ? <Text style={styles.formSuccess}>{stockSuccess}</Text> : null}
                <Pressable
                  onPress={handleAddSizeToCity}
                  disabled={stockBusy || !stockSelected || !data?.selectedCityId}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && styles.pressed,
                    (stockBusy || !stockSelected || !data?.selectedCityId) && styles.disabledAction,
                  ]}
                >
                  {stockBusy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryActionText}>Add to {cityLabel}</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}

          {data?.cities.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityRow}>
              {data.cities.map((city) => {
                const selected = city.id === data.selectedCityId;
                const busy = refreshingCityId === city.id;
                return (
                  <Pressable
                    key={city.id}
                    onPress={() => chooseCity(city.id)}
                    style={[styles.cityChip, selected && styles.cityChipActive]}
                    disabled={loading}
                  >
                    {busy ? <ActivityIndicator color={colors.accent} size="small" /> : null}
                    <Text style={[styles.cityChipText, selected && styles.cityChipTextActive]}>{city.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {loading && !data ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Loading Garage...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorPanel}>
              <AppIcon name="exclamation-triangle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {summary ? (
            <View style={styles.statsGrid}>
              <StatPill label="To buy" value={summary.toBuy} tone="orange" icon="shopping-cart" />
              <StatPill label="Reduced" value={summary.reduced} tone="red" icon="minus-circle" />
              <StatPill label="Added" value={summary.added} tone="green" icon="plus-circle" />
              <StatPill label="Available" value={summary.availableStock} tone="blue" icon="check-circle" />
              <StatPill label="Reserved" value={summary.reservedStock} tone="neutral" icon="lock" />
              <StatPill label="Ordered" value={summary.orderedStock} tone="neutral" icon="truck" />
            </View>
          ) : null}

          <SectionTitle title="What to buy" subtitle="Target stock plus recent reductions" />
          {data?.toBuy.length ? (
            <View style={styles.sectionStack}>
              {data.toBuy.map((item) => <ToBuyCard key={item.tyreProductId} item={item} />)}
            </View>
          ) : (
            <EmptyState icon="check-circle" title="Nothing to buy from stock rules" text="No target gap or recent reduction for this city." />
          )}

          <SectionTitle title="Missing tyre requests" subtitle="Explicit requests from the Stock app" />
          {data?.missingTyres.length ? (
            <View style={styles.sectionStack}>
              {data.missingTyres.map((item) => <MissingCard key={item.normalizedSize} item={item} />)}
            </View>
          ) : (
            <EmptyState icon="search" title="No missing tyre requests" text="Requests appear here after staff record a missing size." />
          )}

          <SectionTitle title="Reduced by drivers" subtitle="Sales, damage, and negative corrections" />
          {data?.reductions.length ? (
            <View style={styles.sectionStack}>
              {data.reductions.map((item) => <MovementCard key={item.id} item={item} mode="reduced" />)}
            </View>
          ) : (
            <EmptyState icon="minus-circle" title="No reductions yet" text="Driver reductions and sales will show here with their names." />
          )}

          <SectionTitle title="Added to stock" subtitle="Received, returns, reversals, positive corrections" />
          {data?.additions.length ? (
            <View style={styles.sectionStack}>
              {data.additions.map((item) => <MovementCard key={item.id} item={item} mode="added" />)}
            </View>
          ) : (
            <EmptyState icon="plus-circle" title="No additions yet" text="New stock additions will show here with the admin or staff member." />
          )}

          <SectionTitle title="Shifts" subtitle="Start/end dates, duration, tyres sold" />
          {data?.shifts.length ? (
            <View style={styles.sectionStack}>
              {data.shifts.map((item) => <ShiftCard key={item.id} item={item} />)}
            </View>
          ) : (
            <EmptyState icon="clock-o" title="No shifts in this period" text="Start and end times appear here after a Stock app shift is used." />
          )}
        </ScrollView>
      </AdminModalShell>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  pressed: {
    opacity: 0.72,
  },
  headerIconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  actionPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: space.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  panelTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  panelSubtitle: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  panelClose: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuStack: {
    gap: space.sm,
  },
  menuOption: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  menuOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  menuOptionTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  menuOptionText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  ideaBlock: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
    padding: space.md,
    gap: space.sm,
  },
  ideaTitle: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ideaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  ideaChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  ideaChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  formStack: {
    gap: space.md,
  },
  fieldBlock: {
    gap: space.xs,
  },
  fieldLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  helperText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  formError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  formSuccess: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  primaryAction: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  primaryActionText: {
    color: colors.accentText,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.5,
  },
  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
  },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockResults: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stockResult: {
    minHeight: 66,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  stockResultSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  stockResultCopy: {
    flex: 1,
    minWidth: 0,
  },
  stockResultSize: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  stockResultMeta: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  stockResultQty: {
    color: colors.success,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  inlineFields: {
    flexDirection: 'row',
    gap: space.sm,
  },
  inlineField: {
    flex: 1,
    gap: space.xs,
  },
  cityRow: {
    gap: space.sm,
    paddingRight: space.lg,
  },
  cityChip: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  cityChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  cityChipText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  cityChipTextActive: {
    color: colors.text,
  },
  loadingPanel: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  errorPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    padding: space.md,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '800',
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    alignItems: 'stretch',
  },
  statPill: {
    minWidth: 104,
    flexBasis: 108,
    flexGrow: 1,
    minHeight: 66,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: colors.cardMuted,
    justifyContent: 'space-between',
  },
  statPill_orange: {
    borderColor: 'rgba(255,122,24,0.42)',
    backgroundColor: 'rgba(255,122,24,0.075)',
  },
  statPill_blue: {
    borderColor: 'rgba(79,140,255,0.34)',
    backgroundColor: 'rgba(79,140,255,0.08)',
  },
  statPill_green: {
    borderColor: 'rgba(53,230,107,0.30)',
    backgroundColor: 'rgba(53,230,107,0.075)',
  },
  statPill_red: {
    borderColor: 'rgba(255,77,99,0.32)',
    backgroundColor: 'rgba(255,77,99,0.075)',
  },
  statPill_neutral: {
    borderColor: 'rgba(165,181,230,0.18)',
    backgroundColor: 'rgba(13,20,39,0.72)',
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  statIconShell: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  statIconShell_orange: {
    borderColor: 'rgba(255,122,24,0.38)',
    backgroundColor: 'rgba(255,122,24,0.10)',
  },
  statIconShell_blue: {
    borderColor: 'rgba(79,140,255,0.32)',
    backgroundColor: 'rgba(79,140,255,0.10)',
  },
  statIconShell_green: {
    borderColor: 'rgba(53,230,107,0.28)',
    backgroundColor: 'rgba(53,230,107,0.10)',
  },
  statIconShell_red: {
    borderColor: 'rgba(255,77,99,0.30)',
    backgroundColor: 'rgba(255,77,99,0.10)',
  },
  statIconShell_neutral: {
    borderColor: 'rgba(165,181,230,0.20)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    flexShrink: 1,
    textAlign: 'right',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: space.xs,
  },
  sectionTitleRow: {
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionSubtitle: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  sectionStack: {
    gap: space.sm,
  },
  buyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: space.md,
  },
  buyTop: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  buyQty: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyQtyLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  buyQtyValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0,
  },
  buyCopy: {
    flex: 1,
    minWidth: 0,
  },
  buyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    letterSpacing: 0,
  },
  buyMeta: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  buyHint: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    marginTop: 6,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  detailLine: {
    minWidth: 132,
    flexGrow: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    padding: space.sm,
  },
  detailLabel: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    marginTop: 3,
  },
  missingCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
    padding: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    alignItems: 'center',
  },
  missingSize: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  missingMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 3,
  },
  missingCount: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  missingCountValue: {
    color: colors.warning,
    fontSize: 24,
    fontWeight: '900',
  },
  missingCountLabel: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  movementCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
  },
  movementIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementIconAdd: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  movementIconReduce: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  movementCopy: {
    flex: 1,
    minWidth: 0,
  },
  movementTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  movementTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    flex: 1,
  },
  movementQty: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  qtyAdd: {
    color: colors.success,
  },
  qtyReduce: {
    color: colors.danger,
  },
  movementMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 3,
  },
  movementNote: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 5,
  },
  shiftCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    padding: space.md,
    gap: space.md,
  },
  shiftTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    alignItems: 'center',
  },
  shiftName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  shiftEmail: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  shiftBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  shiftBadgeActive: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  shiftBadgeEnded: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.cardMuted,
  },
  shiftBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  shiftBadgeTextActive: {
    color: colors.success,
  },
  shiftBadgeTextEnded: {
    color: colors.muted,
  },
  shiftOverride: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  emptyState: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
});
