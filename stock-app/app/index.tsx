import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, stockApi } from '@/api/client';
import { useAuth } from '@/auth/context';
import { SaleCard } from '@/components/SaleCard';
import { StockInventory } from '@/components/StockInventory';
import { StockLogin } from '@/components/StockLogin';
import { StockMovements } from '@/components/StockMovements';
import { StockShifts } from '@/components/StockShifts';
import { Button, Message } from '@/components/StockPrimitives';
import { useCityResource } from '@/hooks/useCityResource';
import { useStockInventory } from '@/hooks/useStockInventory';
import { createMovementPayload, operationKey, stockError } from '@/stock-domain';
import { clearPendingMovement, readPendingMovement, savePendingMovement } from '@/pending-movement';
import { colors, radius, spacing } from '@/theme';
import type { InventoryItem, MovementDraft, MovementPayload, StockCity, StockMovement, StockSeasonFilter, StockShift, StockSortOption, StockWorker } from '@/types';

type Tab = 'inventory' | 'movements' | 'shifts';
const tabs: ReadonlyArray<{ key: Tab; label: string; icon: 'tire' | 'swap-vertical' | 'account-clock-outline' }> = [
  { key: 'inventory', label: 'Stock', icon: 'tire' },
  { key: 'movements', label: 'Movements', icon: 'swap-vertical' },
  { key: 'shifts', label: 'Shifts', icon: 'account-clock-outline' },
];
const fetchMovements = (cityId: string) => stockApi.movements(cityId);
const fetchWorkers = (cityId: string) => stockApi.workers(cityId);

export default function StockApp() {
  const { user, token, isLoading } = useAuth();
  if (isLoading && (!user || !token)) return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (!user || !token) return <StockLogin />;
  return <StockWorkspace key={user.id + ':' + token} />;
}

function StockWorkspace() {
  const { user, logout, connectionError, retrySession } = useAuth();
  const userId = user?.id;
  const [tab, setTab] = useState<Tab>('inventory');
  const [cities, setCities] = useState<StockCity[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<StockShift | null>(null);
  const [sharedWorkerMode, setSharedWorkerMode] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [season, setSeason] = useState<StockSeasonFilter>('all');
  const [sort, setSort] = useState<StockSortOption>('size');
  const [selection, setSelection] = useState<InventoryItem | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [missingSaving, setMissingSaving] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<MovementDraft | null>(null);
  const [restoringPending, setRestoringPending] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [rejectedPending, setRejectedPending] = useState(false);
  const [workspaceHeight, setWorkspaceHeight] = useState(640);
  const pending = useRef<MovementPayload | null>(null);
  const writing = useRef(false);
  const coreSequence = useRef(0);
  const cityRef = useRef(cityId);
  cityRef.current = cityId;

  const inventory = useStockInventory(cityId, search, season, sort, revision);
  const saleInventory = useStockInventory(cityId, saleSearch, 'all', 'size', revision, selection?.cityId === cityId ? selection.tyreProductId : undefined);
  const movements = useCityResource<StockMovement>(cityId, true, revision, fetchMovements);
  const workers = useCityResource<StockWorker>(cityId, sharedWorkerMode, revision, fetchWorkers);
  const city = cities.find((entry) => entry.id === cityId) ?? null;
  const selectedWorker = workers.items.find((entry) => entry.userId === selectedWorkerId) ?? null;
  const shift = sharedWorkerMode ? selectedWorker?.activeShift ?? null : activeShift;
  const canManage = city?.roleInCity === 'manager';
  const item = selection?.cityId === cityId
    ? uncertain ? selection : saleInventory.hasLoaded ? saleInventory.items.find((entry) => entry.tyreProductId === selection.tyreProductId) ?? null : selection
    : null;

  const loadCore = useCallback(async () => {
    const sequence = ++coreSequence.current;
    setCoreLoading(true); setCoreError(null);
    try {
      const [cityResult, shiftResult] = await Promise.all([stockApi.cities(), stockApi.activeShift()]);
      if (sequence !== coreSequence.current) return;
      setCities(cityResult.items);
      setSharedWorkerMode(cityResult.capabilities?.sharedWorkerMode ?? false);
      const nextShift = shiftResult.shift?.status === 'active' && !shiftResult.shift.endedAt ? shiftResult.shift : null;
      setActiveShift(nextShift);
      setCityId((current) => {
        if (pending.current && cityResult.items.some((entry) => entry.id === pending.current?.cityId)) return pending.current.cityId;
        if (nextShift?.cityId && cityResult.items.some((entry) => entry.id === nextShift.cityId)) return nextShift.cityId;
        if (current && cityResult.items.some((entry) => entry.id === current)) return current;
        return cityResult.items[0]?.id ?? null;
      });
    } catch (error) {
      if (sequence === coreSequence.current) {
        setCoreError(stockError(error));
        if (error instanceof ApiError && error.status === 401) void retrySession();
      }
    } finally {
      if (sequence === coreSequence.current) setCoreLoading(false);
    }
  }, [retrySession]);
  useEffect(() => {
    const tracker = coreSequence;
    void loadCore();
    return () => { tracker.current++; };
  }, [loadCore]);
  useEffect(() => {
    if ([inventory.status, saleInventory.status, movements.status, workers.status].includes(401)) {
      void retrySession();
    }
  }, [inventory.status, saleInventory.status, movements.status, workers.status, retrySession]);
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    readPendingMovement(userId).then((saved) => {
      if (cancelled || !saved) return;
      pending.current = saved.payload;
      setRecoveryDraft(saved.draft); setSelection(saved.item); setCityId(saved.payload.cityId);
      setSaleSearch(saved.item.product.sizeDisplay); setSelectedWorkerId(saved.payload.workerUserId ?? null);
      setUncertain(true); setSaleOpen(true);
      setSaleError('An earlier operation needs confirmation. Retry it safely with the same operation reference.');
    }).catch((error) => { if (!cancelled) setRecoveryError(stockError(error)); })
      .finally(() => { if (!cancelled) setRestoringPending(false); });
    return () => { cancelled = true; };
  }, [userId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = () => { setRevision((value) => value + 1); void loadCore(); };
  const shiftLabel = sharedWorkerMode
    ? selectedWorker ? selectedWorker.name + ' · ' + (shift ? 'On shift' : 'Off shift') : 'Choose worker'
    : shift ? (city?.name ?? 'City') + ' · On shift' : 'No active shift';
  const blockedReason = restoringPending ? 'Checking saved stock operations…'
    : recoveryError ? recoveryError
    : connectionError ? 'Reconnect before recording a new movement.'
    : !city ? 'Select a stock city first.'
    : coreLoading ? 'Checking city access and shift…'
      : coreError ? 'Refresh city access before recording a movement.'
        : city.roleInCity === 'viewer' ? 'Your access to this city is read only.'
          : sharedWorkerMode && workers.loading ? 'Loading worker shifts…'
            : sharedWorkerMode && !selectedWorker ? 'Choose a worker in Shifts before recording a movement.'
              : sharedWorkerMode && (!shift || shift.cityId !== city.id) ? 'Start the selected worker’s shift in this city.'
                : saleInventory.loading ? 'Loading the latest stock…'
                  : saleInventory.error ? 'Reload stock before recording a movement.' : null;

  const chooseCity = (nextCity: StockCity) => {
    if (writing.current || pending.current || restoringPending || recoveryError || (activeShift && activeShift.cityId !== nextCity.id)) return;
    setCityId(nextCity.id); setCityPickerOpen(false); setSelection(null);
    setSearch(''); setSaleSearch(''); setSeason('all'); setSelectedWorkerId(null);
    setSaleError(null); setNotice(null); setActionError(null);
  };
  const selectItem = (nextItem: InventoryItem) => {
    if (pending.current) { setSaleOpen(true); return; }
    if (writing.current || restoringPending || recoveryError || nextItem.cityId !== cityRef.current) return;
    setSelection(nextItem); setSaleSearch(nextItem.product.sizeDisplay); setSaleError(null); setSaleOpen(true);
  };
  const submitMovement = async (draft: MovementDraft) => {
    if (writing.current) throw new Error('Please wait for the current operation.');
    if (recoveryError) throw new Error(recoveryError);
    const wasUncertain = uncertain;
    setSaleError(null);
    try {
      if (!pending.current) {
        if (blockedReason) throw new Error(blockedReason);
        if (!item || !city) throw new Error('Select a tyre from this city first.');
        const payload = createMovementPayload(draft, item, { city, shift, sharedWorkerMode, workerUserId: selectedWorkerId }, operationKey());
        writing.current = true; setSaving(true);
        await savePendingMovement(user!.id, { payload, draft, item });
        pending.current = payload; setRecoveryDraft(draft);
      }
      writing.current = true; setSaving(true);
      const payload = pending.current;
      const receipt = wasUncertain ? await stockApi.movementReceipt(payload.cityId, payload.idempotencyKey) : null;
      if (receipt?.movement && (receipt.movement.idempotencyKey !== payload.idempotencyKey || receipt.movement.cityId !== payload.cityId || receipt.movement.tyreProductId !== payload.tyreProductId || receipt.movement.movementType !== payload.movementType || receipt.movement.quantityDelta !== payload.quantityDelta)) {
        throw new Error('The saved operation reference does not match this movement. Ask your manager to check the movement history.');
      }
      const saved = receipt?.movement ?? (await stockApi.recordMovement(payload)).movement;
      await clearPendingMovement(user!.id);
      pending.current = null; setUncertain(false); setRecoveryDraft(null);
      setNotice((draft.movementType === 'SALE' ? 'Sale recorded' : 'Stock updated') + ' · ' + saved.previousBalance + ' → ' + saved.resultingBalance);
      refresh();
    } catch (error) {
      if (pending.current) {
        const unknownOutcome = wasUncertain || !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
        if (unknownOutcome) {
          setUncertain(true);
          setSaleError('The result is not confirmed. Check movements or retry this same operation safely.');
        } else {
          try {
            await clearPendingMovement(user!.id);
            pending.current = null; setUncertain(false); setRecoveryDraft(null);
          } catch {
            setRejectedPending(true);
            setRecoveryError('This operation was rejected, but its saved retry could not be cleared. Clear it before making another change.');
          }
          setSaleError(stockError(error));
        }
      } else setSaleError(stockError(error));
      throw error;
    } finally { writing.current = false; setSaving(false); }
  };
  const runShiftAction = async (action: () => Promise<unknown>, success: string) => {
    if (writing.current || pending.current || coreLoading || restoringPending || recoveryError || connectionError) return;
    writing.current = true; setSaving(true); setActionError(null);
    try { await action(); setNotice(success); refresh(); }
    catch (error) { setActionError(stockError(error)); }
    finally { writing.current = false; setSaving(false); }
  };
  const clearRejected = async () => {
    if (!userId || !rejectedPending || writing.current) return;
    try {
      await clearPendingMovement(userId);
      pending.current = null; setRejectedPending(false); setRecoveryError(null); setRecoveryDraft(null);
    } catch (error) { setRecoveryError(stockError(error)); }
  };
  const recordMissing = async (size: string) => {
    if (!city || city.roleInCity === 'viewer' || !inventory.hasLoaded || inventory.error || inventory.loading || season !== 'all' || search.trim().length < 3 || inventory.items.length) throw new Error('Complete a successful search across all tyre types before requesting a missing tyre.');
    if (writing.current || pending.current || restoringPending || recoveryError || connectionError) throw new Error('Resolve the pending operation or reconnect before sending this request.');
    writing.current = true; setMissingSaving(true); setActionError(null);
    try {
      await stockApi.recordMissingTyre({ cityId: city.id, size: size.trim(), shiftId: shift?.cityId === city.id ? shift.id : null, saleChannel: null });
      setNotice('Missing tyre requested: ' + size.trim());
    } catch (error) { setActionError(stockError(error)); throw error; }
    finally { writing.current = false; setMissingSaving(false); }
  };
  const editSeason = async (product: InventoryItem, nextSeason: 'summer' | 'winter' | 'allseason') => {
    if (!canManage || product.cityId !== cityRef.current || saleInventory.loading || saleInventory.error || writing.current || pending.current || restoringPending || recoveryError || connectionError) throw new Error('Refresh stock and resolve any pending operation before editing this tyre.');
    writing.current = true; setSaving(true); setActionError(null);
    try { await stockApi.updateSeason(product.cityId, product.tyreProductId, nextSeason); setNotice('Tyre season updated'); refresh(); }
    catch (error) { setActionError(stockError(error)); throw error; }
    finally { writing.current = false; setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.workspace} behavior={Platform.OS === 'ios' ? 'padding' : undefined} onLayout={(event) => setWorkspaceHeight(event.nativeEvent.layout.height)}>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose stock city" accessibilityState={{ expanded: cityPickerOpen, disabled: saving || uncertain }} disabled={saving || uncertain} onPress={() => setCityPickerOpen((value) => !value)} style={styles.cityButton}>
            <MaterialCommunityIcons name="map-marker-outline" size={22} color={colors.primary} />
            <View style={styles.cityText}><Text style={styles.brand}>TYRE RESCUE STOCK</Text><Text style={styles.cityName} numberOfLines={1}>{city?.name ?? (coreLoading ? 'Loading cities…' : 'Choose city')}</Text></View>
            <MaterialCommunityIcons name="chevron-down" size={20} color={colors.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open sale card" accessibilityState={{ expanded: saleOpen }} onPress={() => setSaleOpen((value) => uncertain || saving ? true : !value)} style={styles.saleButton}><MaterialCommunityIcons name="cart-outline" size={20} color="#111111" /><Text style={styles.saleButtonText}>Sale</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh stock and shifts" disabled={saving || coreLoading} onPress={refresh} style={styles.iconButton}><MaterialCommunityIcons name="refresh" size={22} color={colors.text} /></Pressable>
        </View>
        {cityPickerOpen ? <View style={styles.cityPicker}>
          {cities.map((entry) => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ selected: entry.id === cityId, disabled: Boolean(activeShift && activeShift.cityId !== entry.id) }} disabled={Boolean(activeShift && activeShift.cityId !== entry.id)} onPress={() => chooseCity(entry)} style={[styles.cityChoice, entry.id === cityId && styles.selectedCity]}><Text style={styles.cityChoiceName}>{entry.name}</Text><Text style={styles.secondary}>{entry.roleInCity}{activeShift && activeShift.cityId !== entry.id ? ' · End your shift to switch' : ''}</Text></Pressable>)}
          <Text style={styles.account}>{user?.name} · {user?.role}</Text>
          <Button title="Sign out" disabled={saving || restoringPending} onPress={() => { void logout().catch((error) => setActionError(stockError(error))); }} />
        </View> : null}
        <View style={styles.panelWrap} collapsable={false}>
          <View style={[{ flexShrink: 1 }, !saleOpen && styles.hidden]}>
            <SaleCard
              city={city} item={item} search={saleSearch}
              onSearchChange={(value) => { if (!pending.current && !writing.current) { setSaleSearch(value); setSelection(null); setSaleError(null); } }}
              results={saleInventory.items.slice(0, 4)} loading={saleInventory.loading}
              error={saleError ?? saleInventory.error} onSelect={selectItem}
              onClose={() => { if (!saving && !uncertain) setSaleOpen(false); }}
              onSubmit={submitMovement} saving={saving} blockedReason={blockedReason}
              canManage={canManage} shiftLabel={shiftLabel}
              onShowShifts={() => { setTab('shifts'); setSaleOpen(false); }}
              uncertain={uncertain} recoveryDraft={recoveryDraft}
              onCancelRetry={() => { setTab('movements'); setSaleOpen(false); }}
              onSeasonEdit={editSeason} maxHeight={Math.max(180, (workspaceHeight - 126) * 0.58)}
            />
          </View>
        </View>
        {!saleOpen ? <Pressable accessibilityRole="button" accessibilityLabel={'Show shifts: ' + shiftLabel} onPress={() => { setTab('shifts'); }} style={styles.shiftStrip}><MaterialCommunityIcons name={shift ? 'check-circle' : 'clock-outline'} size={16} color={shift ? colors.success : colors.muted} /><Text style={styles.shiftLabel} numberOfLines={1}>{shiftLabel}</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} /></Pressable> : null}
        {connectionError ? <View style={styles.status}><Message text={connectionError} tone="error" /><Button title="Reconnect" onPress={() => { void retrySession().then(refresh); }} /></View> : null}
        {coreError ? <View style={styles.status}><Message text={coreError} tone="error" /><Button title="Retry city access" onPress={() => { void loadCore(); }} /></View> : null}
        {actionError ? <View style={styles.status}><Message text={actionError} tone="error" /></View> : null}
        {recoveryError ? <View style={styles.status}><Message text={recoveryError} tone="error" />{rejectedPending ? <Button title="Clear rejected operation" onPress={() => { void clearRejected(); }} /> : null}</View> : null}
        {notice ? <View style={styles.status}><Message text={notice} tone="success" /></View> : null}
        {uncertain && !saleOpen ? <View style={styles.status}><Message text="A stock operation is awaiting confirmation. Reopen Sale to retry the same operation." tone="info" /><Button title="Resolve operation" onPress={() => setSaleOpen(true)} /></View> : null}
        <View style={styles.page}>
          {!city ? <View style={styles.noCity}><Text style={styles.noCityTitle}>{coreLoading ? 'Loading your stock cities…' : 'No stock city access'}</Text><Text style={styles.secondary}>{coreLoading ? 'Please wait.' : 'Ask your manager to enable access to a stock city.'}</Text></View>
            : tab === 'inventory' ? <StockInventory items={inventory.items} summary={inventory.summary} search={search} onSearchChange={setSearch} season={season} onSeasonChange={setSeason} sort={sort} onSortChange={setSort} loading={inventory.loading} loadingMore={inventory.loadingMore} error={inventory.error} hasLoaded={inventory.hasLoaded} totalCount={inventory.totalCount} hasMore={inventory.hasMore} onLoadMore={inventory.loadMore} onRetry={inventory.reload} onSelect={selectItem} onMissing={recordMissing} canRecordMissing={city.roleInCity !== 'viewer' && !pending.current && !coreError && !coreLoading} missingSaving={missingSaving} onSeasonEdit={editSeason} canManage={canManage && !saving && !uncertain} />
              : tab === 'movements' ? <ScrollView keyboardShouldPersistTaps="handled"><StockMovements items={movements.items} loading={movements.loading} error={movements.error} onRetry={movements.reload} /></ScrollView>
                : <ScrollView keyboardShouldPersistTaps="handled"><StockShifts city={city} activeShift={activeShift} workers={workers.items} selectedWorkerId={selectedWorkerId} sharedWorkerMode={sharedWorkerMode} loading={workers.loading || coreLoading} saving={saving || uncertain || restoringPending || Boolean(recoveryError) || Boolean(connectionError)} error={workers.error ?? actionError} onSelectWorker={(id) => { if (!writing.current && !pending.current) setSelectedWorkerId(id); }} onStart={() => { if (cityId) void runShiftAction(() => stockApi.startShift(cityId), 'Shift started'); }} onEnd={() => { if (activeShift) void runShiftAction(() => stockApi.endShift(activeShift.id), 'Shift ended'); }} onStartWorker={(worker) => { if (cityId && !writing.current && !pending.current) { setSelectedWorkerId(worker.userId); void runShiftAction(() => stockApi.startWorkerShift(cityId, worker.userId), worker.name + ' shift started'); } }} onEndWorker={(worker) => { if (worker.activeShift) void runShiftAction(() => stockApi.endWorkerShift(worker.activeShift!.id), worker.name + ' shift ended'); }} onRetry={refresh} /></ScrollView>}
        </View>
        <View style={styles.tabBar}>{tabs.map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityLabel={entry.label} accessibilityState={{ selected: tab === entry.key }} onPress={() => { setTab(entry.key); }} style={styles.tab}><MaterialCommunityIcons name={entry.icon} size={23} color={tab === entry.key ? colors.primary : colors.muted} /><Text style={[styles.tabText, tab === entry.key && styles.activeTabText]}>{entry.label}</Text></Pressable>)}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, workspace: { flex: 1 }, loading: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cityButton: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, cityText: { flex: 1, minWidth: 0 },
  brand: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.muted }, cityName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  saleButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 5 }, saleButtonText: { fontSize: 15, fontWeight: '800', color: '#111111' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.panel },
  cityPicker: { marginHorizontal: spacing.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.panel },
  cityChoice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md }, selectedCity: { backgroundColor: colors.primarySoft }, cityChoiceName: { color: colors.text, fontSize: 16, fontWeight: '700' }, secondary: { color: colors.muted, fontSize: 13, lineHeight: 19 }, account: { color: colors.muted, fontSize: 13 },
  panelWrap: { flexShrink: 1, marginHorizontal: spacing.md }, hidden: { display: 'none' },
  shiftStrip: { minHeight: 44, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, shiftLabel: { color: colors.muted, fontSize: 13, flex: 1 },
  status: { marginHorizontal: spacing.md, marginBottom: spacing.xs, gap: spacing.xs }, page: { flex: 1, minHeight: 0 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingVertical: spacing.xs }, tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2 }, tabText: { fontSize: 12, fontWeight: '700', color: colors.muted }, activeTabText: { color: colors.primary },
  noCity: { padding: spacing.xl, gap: spacing.md }, noCityTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
});
