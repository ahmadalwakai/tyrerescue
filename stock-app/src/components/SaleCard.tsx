import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors, radius } from '@/theme';
import type { InventoryItem, MovementDraft, StockCity, TyreSeason } from '@/types';

interface SaleCardProps {
  city: StockCity | null;
  item: InventoryItem | null;
  search: string;
  onSearchChange: (search: string) => void;
  results: InventoryItem[];
  loading: boolean;
  error: string | null;
  onSelect: (item: InventoryItem) => void;
  onClose: () => void;
  onSubmit: (draft: MovementDraft) => Promise<void>;
  saving: boolean;
  blockedReason: string | null;
  canManage: boolean;
  shiftLabel: string;
  onShowShifts: () => void;
  uncertain: boolean;
  onCancelRetry: () => void;
  onSeasonEdit?: (item: InventoryItem, season: TyreSeason) => Promise<void>;
  recoveryDraft?: MovementDraft | null;
  maxHeight?: number;
}

const OPERATIONS: { value: MovementDraft['movementType']; label: string }[] = [
  { value: 'SALE', label: 'Sale' },
  { value: 'RECEIVED', label: 'Receive' },
  { value: 'DAMAGED', label: 'Damage' },
  { value: 'CORRECTION', label: 'Correct' },
  { value: 'RETURN', label: 'Return' },
];
const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEASONS: { value: TyreSeason; label: string }[] = [
  { value: 'summer', label: 'Summer' },
  { value: 'winter', label: 'Winter' },
  { value: 'allseason', label: 'All season' },
];

function price(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Price not set' : `£${value.toFixed(2)}`;
}

export function SaleCard({
  city,
  item,
  search,
  onSearchChange,
  results,
  loading,
  error,
  onSelect,
  onClose,
  onSubmit,
  saving,
  blockedReason,
  canManage,
  shiftLabel,
  onShowShifts,
  uncertain,
  onCancelRetry,
  onSeasonEdit,
  recoveryDraft,
  maxHeight,
}: SaleCardProps) {
  const { height } = useWindowDimensions();
  const [movementType, setMovementType] = useState<MovementDraft['movementType']>('SALE');
  const [quantityText, setQuantityText] = useState('1');
  const [direction, setDirection] = useState<MovementDraft['direction']>('add');
  const [saleChannel, setSaleChannel] = useState<MovementDraft['saleChannel']>('GARAGE');
  const [bookingId, setBookingId] = useState('');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonSaving, setSeasonSaving] = useState(false);
  const submittedDraft = useRef<MovementDraft | null>(null);
  const submitting = useRef(false);
  const seasonWriting = useRef(false);
  const locked = saving || uncertain || seasonSaving;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const seasonLocked = locked || loading || !!blockedReason;
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const reducing = movementType === 'SALE' || movementType === 'DAMAGED' || (movementType === 'CORRECTION' && direction === 'reduce');
  const nextStock = item && validQuantity ? item.currentStock + (reducing ? -quantity : quantity) : null;
  const operation = OPERATIONS.find((entry) => entry.value === movementType)!;
  const hasSearch = search.trim().length > 0;
  const visibleResults = results.slice(0, 4);
  const showResults = hasSearch && (!item || search !== item.product.sizeDisplay);
  const formError = !item
    ? 'Choose a tyre to continue.'
    : !validQuantity
      ? 'Enter a whole quantity greater than zero.'
      : reducing && quantity > item.availableStock
        ? `Only ${item.availableStock} unreserved tyres are available.`
        : movementType === 'SALE' && saleChannel === 'EMERGENCY_CALL_OUT' && !BOOKING_ID.test(bookingId.trim())
          ? 'Enter the booking ID for this emergency sale.'
          : movementType === 'CORRECTION' && !note.trim()
            ? 'Add a reason for this stock correction.'
            : null;

  useEffect(() => {
    if (!canManage && !locked) setMovementType('SALE');
  }, [canManage, locked]);

  useEffect(() => {
    if (!lockedRef.current) {
      setQuantityText('1');
      setLocalError(null);
      setSeasonOpen(false);
    }
    // A submitted operation must remain unchanged until its result is known.
  }, [item?.balanceId, city?.id]);

  useEffect(() => {
    if (!uncertain || !recoveryDraft || submittedDraft.current) return;
    submittedDraft.current = recoveryDraft;
    setMovementType(recoveryDraft.movementType);
    setQuantityText(String(recoveryDraft.quantity));
    setDirection(recoveryDraft.direction);
    setSaleChannel(recoveryDraft.saleChannel);
    setBookingId(recoveryDraft.bookingId);
    setNote(recoveryDraft.note);
    setSeasonOpen(false);
  }, [uncertain, recoveryDraft]);

  function changeQuantity(next: string) {
    setQuantityText(next.replace(/[^0-9]/g, ''));
    setLocalError(null);
  }

  async function changeSeason(next: TyreSeason) {
    if (!item || !onSeasonEdit || !canManage || seasonLocked || seasonWriting.current) return;
    seasonWriting.current = true;
    setSeasonSaving(true);
    setLocalError(null);
    try {
      await onSeasonEdit(item, next);
      setSeasonOpen(false);
    } catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : 'Unable to update this tyre season.');
    } finally {
      seasonWriting.current = false;
      setSeasonSaving(false);
    }
  }

  async function submit() {
    if (submitting.current || saving || seasonWriting.current) return;
    if (blockedReason && !uncertain) {
      setLocalError(blockedReason);
      return;
    }
    if (!uncertain && formError) {
      setLocalError(formError);
      return;
    }
    const draft: MovementDraft = uncertain && submittedDraft.current
      ? submittedDraft.current
      : {
          movementType,
          quantity,
          direction: reducing ? 'reduce' : 'add',
          saleChannel,
          bookingId: bookingId.trim(),
          note: note.trim(),
        };
    if (uncertain && !submittedDraft.current) return;
    submittedDraft.current = draft;
    submitting.current = true;
    setLocalError(null);
    Keyboard.dismiss();
    try {
      await onSubmit(draft);
      submittedDraft.current = null;
      setQuantityText('1');
      setNote('');
      setBookingId('');
    } catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : 'Unable to save. Please try again.');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <View style={[styles.card, { maxHeight: Math.max(180, Math.min(maxHeight ?? height * 0.5, 560)) }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name="cart-outline" color={colors.primary} size={22} />
            <Text accessibilityRole="header" style={styles.title}>{operation.label === 'Sale' ? 'Sale' : `${operation.label} stock`}</Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>{city?.name ?? 'Choose a city'} · Stock operation</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sale panel"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={onClose}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, locked && styles.disabled]}
        >
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        {canManage ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.operationChoices}>
            {OPERATIONS.map((entry) => (
              <Pressable
                key={entry.value}
                accessibilityRole="button"
                accessibilityState={{ selected: movementType === entry.value, disabled: locked }}
                disabled={locked}
                onPress={() => { setMovementType(entry.value); setLocalError(null); }}
                style={({ pressed }) => [styles.choice, movementType === entry.value && styles.choiceSelected, pressed && styles.pressed, locked && styles.disabled]}
              >
                <Text style={[styles.choiceText, movementType === entry.value && styles.choiceTextSelected]}>{entry.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" color={colors.muted} size={22} />
          <TextInput
            accessibilityLabel="Find a tyre for this operation"
            placeholder="Search tyre size or brand"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={(value) => { onSearchChange(value); setLocalError(null); }}
            editable={!locked}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {loading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          {hasSearch && !locked ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear tyre search" onPress={() => onSearchChange('')} style={styles.iconButton}>
              <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {showResults && visibleResults.length > 0 && !loading ? (
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.results}>
            {visibleResults.map((result) => (
              <Pressable
                key={result.balanceId}
                accessibilityRole="button"
                accessibilityLabel={`${result.product.sizeDisplay}, ${result.product.brand}, ${result.availableStock} available`}
                disabled={locked}
                onPress={() => { onSelect(result); setLocalError(null); Keyboard.dismiss(); }}
                style={({ pressed }) => [styles.result, pressed && styles.pressed, result.balanceId === item?.balanceId && styles.resultSelected]}
              >
                <View style={styles.resultDescription}>
                  <Text style={styles.resultTitle} numberOfLines={1}>{result.product.sizeDisplay}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>{result.product.brand} {result.product.pattern}</Text>
                </View>
                <Text style={styles.resultStock}>{result.availableStock} available</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : showResults && !loading && !error ? <Text style={styles.hint}>No matching tyres. Try another size or brand.</Text> : null}

        {item ? (
          <View style={styles.selectedItem}>
            <View style={styles.itemTop}>
              <View style={styles.resultDescription}>
                <Text style={styles.tyreSize}>{item.product.sizeDisplay}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>{item.product.brand} {item.product.pattern}</Text>
              </View>
              <View style={styles.stockSummary}>
                <Text style={styles.available}>{item.availableStock}</Text>
                <Text style={styles.subtitle}>available</Text>
              </View>
            </View>
            <View style={styles.itemBottom}>
              <Text style={styles.price}>{price(item.product.priceNew)}</Text>
              <Text style={styles.subtitle}>Stock {item.currentStock} · Reserved {item.reservedStock}</Text>
            </View>
            <View style={styles.seasonRow}>
              <View style={styles.seasonBadge}>
                <Text style={styles.seasonBadgeText}>{SEASONS.find((entry) => entry.value === item.product.season)?.label ?? 'Season not set'}</Text>
              </View>
              {canManage && onSeasonEdit ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit tyre season"
                  accessibilityState={{ expanded: seasonOpen, disabled: seasonLocked }}
                  disabled={seasonLocked}
                  onPress={() => setSeasonOpen((current) => !current)}
                  style={({ pressed }) => [styles.seasonToggle, pressed && styles.pressed, seasonLocked && styles.disabled]}
                >
                  {seasonSaving ? <ActivityIndicator color={colors.primary} size="small" /> : null}
                  <Text style={styles.seasonToggleText}>Edit season</Text>
                  <MaterialCommunityIcons name={seasonOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
            {canManage && onSeasonEdit && seasonOpen ? (
              <View style={styles.twoChoices}>
                {SEASONS.map((entry) => (
                  <Pressable
                    key={entry.value}
                    accessibilityRole="button"
                    accessibilityLabel={`Set tyre season to ${entry.label}`}
                    accessibilityState={{ selected: item.product.season === entry.value, disabled: seasonLocked }}
                    disabled={seasonLocked || item.product.season === entry.value}
                    onPress={() => { void changeSeason(entry.value); }}
                    style={({ pressed }) => [styles.choice, styles.flexChoice, item.product.season === entry.value && styles.choiceSelected, pressed && styles.pressed, seasonLocked && styles.disabled]}
                  ><Text style={[styles.choiceText, item.product.season === entry.value && styles.choiceTextSelected]}>{entry.label}</Text></Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : <Text style={styles.hint}>Select a tyre from the search results or inventory.</Text>}

        {item ? <View style={styles.quantityRow}>
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              accessibilityState={{ disabled: locked || !validQuantity || quantity <= 1 }}
              disabled={locked || !validQuantity || quantity <= 1}
              onPress={() => changeQuantity(String(quantity - 1))}
              style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, (locked || !validQuantity || quantity <= 1) && styles.disabled]}
            ><MaterialCommunityIcons name="minus" color={colors.text} size={23} /></Pressable>
            <TextInput
              accessibilityLabel="Number of tyres"
              keyboardType="number-pad"
              selectTextOnFocus
              editable={!locked}
              value={quantityText}
              onChangeText={changeQuantity}
              style={styles.quantityInput}
              maxLength={7}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
              disabled={locked}
              onPress={() => changeQuantity(String(validQuantity ? Math.min(quantity + 1, 9999999) : 1))}
              style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed, locked && styles.disabled]}
            ><MaterialCommunityIcons name="plus" color={colors.text} size={23} /></Pressable>
          </View>
        </View> : null}

        {item && movementType === 'SALE' ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Sale channel</Text>
            <View style={styles.twoChoices}>
              {([{ value: 'GARAGE', label: 'Garage' }, { value: 'EMERGENCY_CALL_OUT', label: 'Emergency' }] as const).map((channel) => (
                <Pressable
                  key={channel.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: saleChannel === channel.value, disabled: locked }}
                  disabled={locked}
                  onPress={() => { setSaleChannel(channel.value); setLocalError(null); }}
                  style={({ pressed }) => [styles.choice, styles.flexChoice, saleChannel === channel.value && styles.choiceSelected, pressed && styles.pressed, locked && styles.disabled]}
                ><Text style={[styles.choiceText, saleChannel === channel.value && styles.choiceTextSelected]}>{channel.label}</Text></Pressable>
              ))}
            </View>
            {saleChannel === 'EMERGENCY_CALL_OUT' ? (
              <TextInput
                accessibilityLabel="Emergency booking ID"
                placeholder="Booking ID (required)"
                placeholderTextColor={colors.muted}
                value={bookingId}
                onChangeText={(value) => { setBookingId(value); setLocalError(null); }}
                editable={!locked}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            ) : null}
          </View>
        ) : null}

        {item && movementType === 'CORRECTION' ? (
          <View style={styles.twoChoices}>
            {([{ value: 'add', label: 'Add to stock' }, { value: 'reduce', label: 'Reduce stock' }] as const).map((entry) => (
              <Pressable key={entry.value} accessibilityRole="button" accessibilityState={{ selected: direction === entry.value }} disabled={locked} onPress={() => setDirection(entry.value)} style={[styles.choice, styles.flexChoice, direction === entry.value && styles.choiceSelected, locked && styles.disabled]}>
                <Text style={[styles.choiceText, direction === entry.value && styles.choiceTextSelected]}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {item && movementType !== 'SALE' ? (
          <TextInput
            accessibilityLabel={movementType === 'CORRECTION' ? 'Required correction reason' : 'Movement note, optional'}
            placeholder={movementType === 'CORRECTION' ? 'Reason for correction (required)' : 'Note (optional)'}
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={(value) => { setNote(value); setLocalError(null); }}
            editable={!locked}
            style={styles.input}
            maxLength={500}
          />
        ) : null}

        {nextStock !== null && item ? (
          <View style={styles.preview}>
            <Text style={styles.subtitle}>Stock after {operation.label.toLowerCase()}</Text>
            <Text style={[styles.previewBalance, (nextStock < item.reservedStock) && styles.errorText]}>{item.currentStock} → {nextStock}</Text>
          </View>
        ) : null}
        {blockedReason ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{blockedReason}</Text> : null}
        {error || localError ? <Text accessibilityRole="alert" style={styles.errorText}>{localError ?? error}</Text> : null}
        {uncertain ? (
          <View style={styles.retryNotice}>
            <Text style={styles.notice}>The result is not confirmed. Retry the same operation safely, or check the movements. This operation stays available to retry.</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={onCancelRetry} style={[styles.discardButton, saving && styles.disabled]}>
              <Text style={styles.discardText}>Check movements</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={uncertain ? 'Retry the same stock operation' : `Confirm ${operation.label.toLowerCase()}`}
          accessibilityState={{ disabled: saving || seasonSaving || (!uncertain && (!!blockedReason || !item)) || (uncertain && !submittedDraft.current), busy: saving || seasonSaving }}
          disabled={saving || seasonSaving || (!uncertain && (!!blockedReason || !item)) || (uncertain && !submittedDraft.current)}
          onPress={() => { void submit(); }}
          style={({ pressed }) => [styles.submit, pressed && styles.pressed, (saving || seasonSaving || (!uncertain && (!!blockedReason || !item))) && styles.disabled]}
        >
          {saving ? <ActivityIndicator color={colors.bg} size="small" /> : <MaterialCommunityIcons name="check" color={colors.bg} size={21} />}
          <Text style={styles.submitText}>{saving ? 'Saving…' : uncertain ? 'Retry same operation' : !item ? 'Select a tyre to continue' : `Confirm ${operation.label.toLowerCase()} · ${validQuantity ? quantity : '—'} ${quantity === 1 ? 'tyre' : 'tyres'}`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open shifts. ${shiftLabel}`} disabled={saving || seasonSaving} onPress={onShowShifts} style={styles.shiftLink}>
          <MaterialCommunityIcons name="clock-outline" size={15} color={colors.muted} />
          <Text style={styles.shiftText} numberOfLines={1}>{shiftLabel}</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.xl, marginBottom: 6, shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8, flexShrink: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  heading: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  body: { flexShrink: 1 },
  bodyContent: { padding: 12, gap: 10 },
  operationChoices: { gap: 6 },
  choice: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.border },
  choiceSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: colors.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingLeft: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, gap: 6 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, color: colors.text, fontSize: 15, paddingVertical: 9, paddingHorizontal: 0 },
  results: { maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  result: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultSelected: { backgroundColor: colors.primarySoft },
  resultDescription: { flex: 1, minWidth: 0 },
  resultTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  resultStock: { color: colors.success, fontSize: 12, fontWeight: '700' },
  selectedItem: { padding: 10, backgroundColor: colors.panelSoft, borderRadius: radius.md, gap: 8 },
  itemTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  tyreSize: { fontSize: 23, fontWeight: '800', color: colors.text },
  stockSummary: { alignItems: 'flex-end' },
  available: { color: colors.success, fontSize: 25, fontWeight: '800' },
  itemBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary },
  seasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  seasonBadge: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: colors.panelMuted },
  seasonBadgeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  seasonToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  seasonToggleText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  quantityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelSoft, borderRadius: radius.md },
  quantityInput: { width: 64, minHeight: 44, textAlign: 'center', color: colors.text, fontSize: 21, fontWeight: '800', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 4, paddingVertical: 5 },
  fieldGroup: { gap: 8 },
  twoChoices: { flexDirection: 'row', gap: 8 },
  flexChoice: { flex: 1, paddingHorizontal: 6 },
  input: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md },
  preview: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingVertical: 4 },
  previewBalance: { fontSize: 18, fontWeight: '800', color: colors.text },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  notice: { color: colors.warning, fontSize: 13, lineHeight: 18 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  retryNotice: { gap: 6 },
  discardButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md },
  discardText: { color: colors.text, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0 },
  submit: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.primary },
  submitText: { color: colors.bg, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  shiftLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  shiftText: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
