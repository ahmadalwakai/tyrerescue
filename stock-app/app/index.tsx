import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, API_BASE_URL, stockApi } from '@/api/client';
import { useAuth } from '@/auth/context';
import { colors, radius, spacing } from '@/theme';
import type { InventoryItem, SaleChannel, SessionRole, StockCity, StockMovement, StockShift } from '@/types';

type Tone = 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info';

const stockLogo = require('../assets/logo.png');

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toneColors(tone: Tone) {
  switch (tone) {
    case 'primary':
      return { bg: colors.primary, border: colors.primary, text: '#111111' };
    case 'success':
      return { bg: colors.successSoft, border: colors.success, text: colors.success };
    case 'danger':
      return { bg: colors.dangerSoft, border: colors.danger, text: colors.danger };
    case 'warning':
      return { bg: colors.warningSoft, border: colors.warning, text: colors.warning };
    case 'info':
      return { bg: colors.infoSoft, border: colors.info, text: colors.info };
    default:
      return { bg: colors.panelSoft, border: colors.border, text: colors.text };
  }
}

function SpinningTyreIcon({ size, color }: { size: number; color: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <MaterialCommunityIcons name="tire" size={size} color={color} />
    </Animated.View>
  );
}

function Button({
  title,
  icon,
  tone = 'default',
  disabled,
  onPress,
}: {
  title: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: Tone;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = toneColors(tone);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, borderColor: c.border, opacity: disabled ? 0.48 : pressed ? 0.78 : 1 },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={c.text} /> : null}
      <Text style={[styles.buttonText, { color: c.text }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentSelected,
        pressed && { opacity: 0.76 },
      ]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function MetricBadge({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const c = toneColors(tone);
  return (
    <View style={[styles.metricBadge, { borderColor: c.border, backgroundColor: c.bg }]}>
      <View style={[styles.metricBadgeIcon, { borderColor: c.border, backgroundColor: colors.panel }]}>
        <MaterialCommunityIcons name={icon} size={13} color={c.text} />
      </View>
      <View style={styles.metricBadgeText}>
        <Text style={[styles.metricBadgeValue, { color: c.text }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.metricBadgeLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function LoginPanel() {
  const { login } = useAuth();
  const [role, setRole] = useState<SessionRole>('driver');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(role, email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loginShell}>
        <View style={styles.brandMark}>
          <Image source={stockLogo} style={styles.brandLogo} resizeMode="cover" />
        </View>
        <Text style={styles.appName}>Tyre Rescue Stock</Text>
        <Text style={styles.loginSubtitle}>City stock, shifts, sales, and missing tyre requests.</Text>

        <View style={styles.loginPanel}>
          <View style={styles.segmentRow}>
            <Segment label="Driver" selected={role === 'driver'} onPress={() => setRole('driver')} />
            <Segment label="Admin" selected={role === 'admin'} onPress={() => setRole('admin')} />
          </View>

          <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@tyrerescue.uk" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />

          {error ? (
            <View style={styles.alertDanger}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.alertDangerText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title={submitting ? 'Signing in...' : 'Sign in'}
            icon="login"
            tone="primary"
            disabled={submitting || !email.trim() || !password}
            onPress={submit}
          />
          <Text style={styles.baseUrl}>API: {API_BASE_URL}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function StockApp() {
  const { user, token, isLoading, logout } = useAuth();
  const { width } = useWindowDimensions();
  const compactHeader = width < 560;
  const [cities, setCities] = useState<StockCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<StockShift | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState('');
  const [tyreSearchFocused, setTyreSearchFocused] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [saleChannel, setSaleChannel] = useState<SaleChannel>('GARAGE');
  const [confirmingEndShift, setConfirmingEndShift] = useState(false);
  const [missingSize, setMissingSize] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingCore, setLoadingCore] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === selectedCityId) ?? null,
    [cities, selectedCityId],
  );

  const selectedItem = useMemo(
    () => inventory.find((item) => item.tyreProductId === selectedProductId) ?? null,
    [inventory, selectedProductId],
  );

  const autocompleteItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = query
      ? inventory.filter((item) => {
          const label = `${item.product.sizeDisplay} ${item.product.brand} ${item.product.pattern}`.toLowerCase();
          return label.includes(query);
        })
      : inventory;

    return [...items]
      .sort((a, b) => {
        const aSize = a.product.sizeDisplay.toLowerCase();
        const bSize = b.product.sizeDisplay.toLowerCase();
        const aRank = aSize === query ? 0 : aSize.startsWith(query) ? 1 : 2;
        const bRank = bSize === query ? 0 : bSize.startsWith(query) ? 1 : 2;
        if (aRank !== bRank) return aRank - bRank;
        if (a.availableStock !== b.availableStock) return b.availableStock - a.availableStock;
        return a.product.sizeDisplay.localeCompare(b.product.sizeDisplay);
      })
      .slice(0, 6);
  }, [inventory, search]);

  const canAdjustStock = selectedCity?.roleInCity === 'manager';

  const totals = useMemo(() => {
    return inventory.reduce(
      (acc, item) => {
        acc.current += item.currentStock;
        acc.available += item.availableStock;
        acc.reserved += item.reservedStock;
        acc.toBuy += item.suggestedBuy;
        return acc;
      },
      { current: 0, available: 0, reserved: 0, toBuy: 0 },
    );
  }, [inventory]);

  const handleApiError = useCallback(async (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setError(null);
      setNotice(null);
      await logout();
      return;
    }
    setError(errorMessage(err));
  }, [logout]);

  const loadCore = useCallback(async () => {
    if (!user || !token) return;
    setError(null);
    setLoadingCore(true);
    try {
      const [cityResponse, shiftResponse] = await Promise.all([
        stockApi.cities(),
        stockApi.activeShift(),
      ]);
      setCities(cityResponse.items);
      setActiveShift(shiftResponse.shift);
      if (!shiftResponse.shift) setConfirmingEndShift(false);

      const nextCity =
        shiftResponse.shift?.cityId ??
        selectedCityId ??
        (cityResponse.items.length === 1 ? cityResponse.items[0]?.id : null);
      setSelectedCityId(nextCity ?? null);
    } catch (err) {
      await handleApiError(err);
    } finally {
      setLoadingCore(false);
    }
  }, [handleApiError, selectedCityId, token, user]);

  const loadInventory = useCallback(async () => {
    if (!user || !token || !selectedCityId) {
      setInventory([]);
      setMovements([]);
      return;
    }
    setError(null);
    setLoadingInventory(true);
    try {
      const [inventoryResponse, movementResponse] = await Promise.all([
        stockApi.inventory(selectedCityId, search.trim()),
        stockApi.movements(selectedCityId),
      ]);
      setInventory(inventoryResponse.items);
      setMovements(movementResponse.items);
      if (
        selectedProductId &&
        !inventoryResponse.items.some((item) => item.tyreProductId === selectedProductId)
      ) {
        setSelectedProductId(null);
      }
    } catch (err) {
      await handleApiError(err);
    } finally {
      setLoadingInventory(false);
    }
  }, [handleApiError, search, selectedCityId, selectedProductId, token, user]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const refreshAll = async () => {
    await loadCore();
    await loadInventory();
  };

  const startShift = async () => {
    if (!selectedCityId) {
      setError('Select a stock city first');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await stockApi.startShift(selectedCityId);
      if (response.shift.status !== 'active' || response.shift.endedAt) {
        setActiveShift(null);
        setError('Previous shift is already ended. Press Start again.');
        await refreshAll();
        return;
      }
      setActiveShift(response.shift);
      setConfirmingEndShift(false);
      setNotice(response.alreadyStarted ? 'Shift already active' : 'Shift started');
      await refreshAll();
    } catch (err) {
      await handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const endShift = async () => {
    if (!activeShift) return;
    setSaving(true);
    setError(null);
    try {
      const response = await stockApi.endShift(activeShift.id);
      setActiveShift(response.shift.status === 'active' ? response.shift : null);
      setConfirmingEndShift(false);
      setNotice(response.alreadyEnded ? 'Shift already ended' : 'Shift ended');
      await refreshAll();
    } catch (err) {
      await handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const quickAdjustStock = async (item: InventoryItem, direction: 'add' | 'reduce') => {
    if (!selectedCityId) {
      setError('Select a stock city first');
      return;
    }
    if (!canAdjustStock) {
      setError('Manager city access is needed to add or reduce stock');
      return;
    }
    if (direction === 'reduce' && item.currentStock <= 0) {
      setError('This tyre has no stock to reduce');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await stockApi.adjustStock({
        cityId: selectedCityId,
        tyreProductId: item.tyreProductId,
        direction,
        quantity: 1,
        shiftId: activeShift?.id ?? null,
      });
      setNotice(`${direction === 'add' ? 'Added' : 'Reduced'} 1 ${item.product.sizeDisplay}`);
      await loadInventory();
    } catch (err) {
      await handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const recordMissingTyre = async () => {
    if (!selectedCityId) {
      setError('Select a stock city first');
      return;
    }
    const size = (missingSize || search).trim();
    if (size.length < 3) {
      setError('Enter the missing tyre size');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await stockApi.recordMissingTyre({
        cityId: selectedCityId,
        size,
        shiftId: activeShift?.id ?? null,
        saleChannel,
        bookingId: null,
      });
      setMissingSize('');
      setNotice(`Missing tyre requested: ${size}`);
    } catch (err) {
      await handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return <LoginPanel />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loadingCore || loadingInventory} onRefresh={refreshAll} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={styles.headerLogoWrap}>
              <Image source={stockLogo} style={styles.headerLogo} resizeMode="cover" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>Tyre Rescue</Text>
              <Text style={styles.title}>Stock</Text>
              <Text style={styles.subtitle}>
                {user.name} - {user.role}
              </Text>
            </View>
          </View>
          <View style={[styles.headerActions, compactHeader && styles.headerActionsCompact]}>
            <View style={[styles.headerCityCard, compactHeader && styles.headerCardCompact]}>
              <View style={styles.headerCardTitleRow}>
                <Text style={styles.headerShiftTitle}>City</Text>
                <Pressable
                  accessibilityLabel="Refresh stock"
                  accessibilityRole="button"
                  disabled={loadingCore || loadingInventory}
                  onPress={refreshAll}
                  style={({ pressed }) => [
                    styles.headerRefreshButton,
                    (loadingCore || loadingInventory) && { opacity: 0.45 },
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <MaterialCommunityIcons name="refresh" size={18} color={colors.text} />
                </Pressable>
              </View>
              {cities.length === 0 ? (
                <Text style={styles.headerShiftHint} numberOfLines={1}>No stock city access</Text>
              ) : (
                <View style={styles.headerCityList}>
                  {cities.map((city) => (
                    <Pressable
                      accessibilityRole="button"
                      key={city.id}
                      disabled={Boolean(activeShift && activeShift.cityId !== city.id)}
                      onPress={() => setSelectedCityId(city.id)}
                      style={({ pressed }) => [
                        styles.headerCityChoice,
                        selectedCityId === city.id && styles.headerCityChoiceSelected,
                        pressed && { opacity: 0.76 },
                      ]}
                    >
                      <Text style={styles.headerCityName} numberOfLines={1}>{city.name}</Text>
                      <Text style={styles.headerCityRole} numberOfLines={1}>{city.roleInCity}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <View style={[styles.headerShiftCard, compactHeader && styles.headerCardCompact]}>
              <View style={styles.headerShiftText}>
                <Text style={styles.headerShiftTitle}>Shift</Text>
                <Text style={styles.headerShiftHint} numberOfLines={1}>
                  {activeShift ? `${activeShift.cityName ?? selectedCity?.name ?? 'City'} - ${formatDateTime(activeShift.startedAt)}` : 'No active shift'}
                </Text>
              </View>
              {activeShift ? (
                confirmingEndShift ? (
                  <View style={styles.headerShiftConfirm}>
                    <Text style={styles.headerShiftConfirmText}>End shift?</Text>
                    <View style={styles.headerShiftConfirmActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setConfirmingEndShift(false)}
                        style={({ pressed }) => [styles.headerShiftMiniButton, pressed && { opacity: 0.72 }]}
                      >
                        <MaterialCommunityIcons name="close" size={17} color={colors.muted} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving}
                        onPress={endShift}
                        style={({ pressed }) => [
                          styles.headerShiftMiniButton,
                          styles.headerShiftMiniButtonDanger,
                          saving && { opacity: 0.45 },
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <MaterialCommunityIcons name="check" size={17} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.headerShiftControls}>
                    <View style={styles.headerShiftActivePill}>
                      <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
                      <Text style={styles.headerShiftActiveText}>Active</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="End shift"
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => setConfirmingEndShift(true)}
                      style={({ pressed }) => [
                        styles.headerEndShiftButton,
                        saving && { opacity: 0.45 },
                        pressed && { opacity: 0.72 },
                      ]}
                    >
                      <MaterialCommunityIcons name="stop-circle" size={18} color={colors.danger} />
                      <Text style={styles.headerEndShiftText}>End</Text>
                    </Pressable>
                  </View>
                )
              ) : (
                <Button title="Start" icon="play-circle" tone="success" onPress={startShift} disabled={saving || !selectedCityId} />
              )}
            </View>
            <Pressable accessibilityRole="button" onPress={logout} style={styles.iconButton}>
              <MaterialCommunityIcons name="logout" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={styles.alertDanger}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.alertDangerText}>{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.alertSuccess}>
            <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
            <Text style={styles.alertSuccessText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.saleHeader}>
            <View style={styles.saleHeaderText}>
              <Text style={styles.sectionTitle}>Sale</Text>
              <Text style={styles.sectionHint}>
                {selectedItem ? `${selectedItem.product.sizeDisplay} - ${selectedItem.product.brand}` : 'Enter a tyre size, then select the matching stock item'}
              </Text>
            </View>
            <View style={styles.saleBadges}>
              <MetricBadge label="Current" value={totals.current} tone="info" icon="gauge" />
              <MetricBadge label="Available" value={totals.available} tone="success" icon="check-circle" />
              <MetricBadge label="Reserved" value={totals.reserved} tone="warning" icon="lock" />
              <MetricBadge label="To Buy" value={totals.toBuy} tone={totals.toBuy > 0 ? 'danger' : 'default'} icon="cart-plus" />
            </View>
          </View>

          <View style={styles.tyreSearchGroup}>
            <View style={styles.tyreSearchTop}>
              <Text style={styles.label}>Tyre size</Text>
              {selectedItem ? (
                <View style={styles.tyreSelectedPill}>
                  <MaterialCommunityIcons name="check-circle" size={14} color={colors.success} />
                  <Text style={styles.tyreSelectedPillText}>Selected</Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.tyreSearchShell,
                tyreSearchFocused && styles.tyreSearchShellFocused,
                selectedItem && styles.tyreSearchShellSelected,
              ]}
            >
              <View style={styles.tyreSearchIcon}>
                <SpinningTyreIcon size={24} color={selectedItem ? colors.success : colors.primary} />
              </View>
              <TextInput
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setSelectedProductId(null);
                }}
                onFocus={() => setTyreSearchFocused(true)}
                onBlur={() => setTyreSearchFocused(false)}
                onSubmitEditing={() => {
                  const firstItem = autocompleteItems[0];
                  if (!firstItem) return;
                  setSearch(firstItem.product.sizeDisplay);
                  setSelectedProductId(firstItem.tyreProductId);
                }}
                placeholder="225/45 R17"
                placeholderTextColor={colors.subtle}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.tyreSearchInput}
              />
              {search.trim() ? (
                <Pressable
                  accessibilityLabel="Clear tyre size"
                  accessibilityRole="button"
                  onPress={() => {
                    setSearch('');
                    setSelectedProductId(null);
                  }}
                  style={({ pressed }) => [styles.tyreClearButton, pressed && { opacity: 0.72 }]}
                >
                  <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            {selectedItem ? (
              <View style={styles.tyreSelectedStrip}>
                <View style={styles.tyreSelectedMain}>
                  <Text style={styles.tyreSelectedTitle}>{selectedItem.product.sizeDisplay}</Text>
                  <Text style={styles.tyreSelectedMeta} numberOfLines={1}>
                    {selectedItem.product.brand} {selectedItem.product.pattern}
                  </Text>
                </View>
                <View style={styles.tyreSelectedStock}>
                  <Text style={styles.tyreSelectedQty}>{selectedItem.availableStock}</Text>
                  <Text style={styles.tyreSelectedQtyLabel}>available</Text>
                </View>
              </View>
            ) : null}

            {search.trim() && !selectedItem && autocompleteItems.length > 0 ? (
              <View style={styles.autocompletePanel}>
                {autocompleteItems.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.balanceId}
                    onPress={() => {
                      setSearch(item.product.sizeDisplay);
                      setSelectedProductId(item.tyreProductId);
                    }}
                    style={({ pressed }) => [
                      styles.autocompleteRow,
                      item.tyreProductId === selectedProductId && styles.autocompleteRowSelected,
                      pressed && { opacity: 0.76 },
                    ]}
                  >
                    <View style={styles.autocompleteIcon}>
                      <SpinningTyreIcon size={18} color={colors.primary} />
                    </View>
                    <View style={styles.autocompleteMain}>
                      <Text style={styles.autocompleteSize}>{item.product.sizeDisplay}</Text>
                      <Text style={styles.autocompleteMeta} numberOfLines={1}>
                        {item.product.brand} {item.product.pattern}
                      </Text>
                    </View>
                    <View style={styles.autocompleteStockPill}>
                      <Text style={styles.autocompleteQty}>{item.availableStock}</Text>
                      <Text style={styles.autocompleteQtyLabel}>avail</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {search.trim() && !selectedItem && !loadingInventory && autocompleteItems.length === 0 ? (
              <View style={styles.tyreNoMatch}>
                <MaterialCommunityIcons name="magnify-close" size={18} color={colors.warning} />
                <Text style={styles.tyreNoMatchText}>No match</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.segmentRow}>
            <Segment label="Garage" selected={saleChannel === 'GARAGE'} onPress={() => setSaleChannel('GARAGE')} />
            <Segment label="Emergency" selected={saleChannel === 'EMERGENCY_CALL_OUT'} onPress={() => setSaleChannel('EMERGENCY_CALL_OUT')} />
          </View>

        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventory</Text>
          <Text style={styles.sectionHint}>
            {search.trim() ? `Results for ${search.trim()}` : 'Enter a tyre size in Sale to filter stock'}
          </Text>

          {loadingInventory ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading stock...</Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {inventory.map((item) => {
              const selected = item.tyreProductId === selectedProductId;
              const low = item.availableStock <= item.minStock;
              return (
                <View
                  key={item.balanceId}
                  style={[styles.stockRow, selected && styles.stockRowSelected]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedProductId(item.tyreProductId);
                      setSearch(item.product.sizeDisplay);
                    }}
                    style={({ pressed }) => [styles.stockSelectArea, pressed && { opacity: 0.82 }]}
                  >
                    <View style={styles.stockMain}>
                      <Text style={styles.stockSize}>{item.product.sizeDisplay}</Text>
                      <Text style={styles.stockName} numberOfLines={1}>
                        {item.product.brand} {item.product.pattern}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.stockControls}>
                    <View style={styles.stockNumbers}>
                      <Text style={[styles.stockQty, low && { color: colors.danger }]}>{item.availableStock}</Text>
                      <Text style={styles.stockQtyLabel}>available</Text>
                    </View>
                    <View style={styles.stockActionRow}>
                      <Pressable
                        accessibilityLabel={`Reduce ${item.product.sizeDisplay} stock`}
                        accessibilityRole="button"
                        disabled={saving || !canAdjustStock || item.currentStock <= 0}
                        onPress={() => quickAdjustStock(item, 'reduce')}
                        style={({ pressed }) => [
                          styles.stockActionButton,
                          styles.stockMinusButton,
                          (saving || !canAdjustStock || item.currentStock <= 0) && styles.stockActionButtonDisabled,
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <MaterialCommunityIcons name="minus" size={20} color={colors.danger} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Add ${item.product.sizeDisplay} stock`}
                        accessibilityRole="button"
                        disabled={saving || !canAdjustStock}
                        onPress={() => quickAdjustStock(item, 'add')}
                        style={({ pressed }) => [
                          styles.stockActionButton,
                          styles.stockPlusButton,
                          (saving || !canAdjustStock) && styles.stockActionButtonDisabled,
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <MaterialCommunityIcons name="plus" size={20} color={colors.success} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {!loadingInventory && inventory.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="magnify-close" size={28} color={colors.warning} />
              <Text style={styles.emptyTitle}>No matching tyre found</Text>
              <Text style={styles.emptyCopy}>Record an explicit missing tyre request after checking the size.</Text>
              <Field label="Missing size" value={missingSize} onChangeText={setMissingSize} placeholder={search || '225/45 R17'} />
              <Button title="Record missing tyre" icon="clipboard-alert" tone="warning" onPress={recordMissingTyre} disabled={saving || !selectedCityId} />
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Movements</Text>
          <View style={styles.list}>
            {movements.length === 0 ? (
              <Text style={styles.emptyInline}>No movements yet</Text>
            ) : (
              movements.map((movement) => (
                <View key={movement.id} style={styles.movementRow}>
                  <View style={styles.movementIcon}>
                    <MaterialCommunityIcons
                      name={movement.quantityDelta < 0 ? 'arrow-down-bold' : 'arrow-up-bold'}
                      size={18}
                      color={movement.quantityDelta < 0 ? colors.danger : colors.success}
                    />
                  </View>
                  <View style={styles.movementMain}>
                    <Text style={styles.movementTitle}>
                      {movement.movementType} {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}
                    </Text>
                    <Text style={styles.movementMeta} numberOfLines={1}>
                      {movement.product.sizeDisplay} - {movement.actorName ?? 'Unknown'} - {formatDateTime(movement.occurredAt)}
                    </Text>
                  </View>
                  <Text style={styles.resultBalance}>{movement.resultingBalance}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  loginShell: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  brandMark: {
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  loginPanel: {
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  baseUrl: {
    color: colors.subtle,
    fontSize: 12,
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 44,
  },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  headerBrand: {
    flex: 1,
    minWidth: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerLogoWrap: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  headerLogo: {
    width: '100%',
    height: '100%',
  },
  headerText: {
    flex: 1,
    minWidth: 190,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  headerActionsCompact: {
    width: '100%',
    alignItems: 'stretch',
  },
  headerCityCard: {
    minHeight: 58,
    minWidth: 230,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  headerCardCompact: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  headerCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerRefreshButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelSoft,
  },
  headerCityList: {
    gap: spacing.xs,
  },
  headerCityChoice: {
    minHeight: 34,
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.sm,
  },
  headerCityChoiceSelected: {
    borderLeftColor: colors.primary,
  },
  headerCityName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  headerCityRole: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  headerShiftCard: {
    minHeight: 58,
    minWidth: 250,
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerShiftText: {
    flex: 1,
    minWidth: 0,
  },
  headerShiftTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  headerShiftHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  headerShiftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerShiftActivePill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
  },
  headerShiftActiveText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '900',
  },
  headerEndShiftButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm,
  },
  headerEndShiftText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  headerShiftConfirm: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm,
  },
  headerShiftConfirmText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  headerShiftConfirmActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerShiftMiniButton: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  headerShiftMiniButtonDanger: {
    borderColor: colors.danger,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  section: {
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  saleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  saleHeaderText: {
    flex: 1,
    minWidth: 220,
  },
  saleBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  tyreSearchGroup: {
    gap: spacing.sm,
  },
  tyreSearchTop: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tyreSelectedPill: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
  },
  tyreSelectedPillText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tyreSearchShell: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
  },
  tyreSearchShellFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.panelMuted,
  },
  tyreSearchShellSelected: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  tyreSearchIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tyreSearchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  tyreClearButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  tyreSelectedStrip: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tyreSelectedMain: {
    flex: 1,
    minWidth: 0,
  },
  tyreSelectedTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  tyreSelectedMeta: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
  },
  tyreSelectedStock: {
    alignItems: 'flex-end',
    minWidth: 68,
  },
  tyreSelectedQty: {
    color: colors.success,
    fontSize: 21,
    fontWeight: '900',
  },
  tyreSelectedQtyLabel: {
    color: colors.muted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  tyreNoMatch: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
  },
  tyreNoMatchText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    color: colors.text,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  autocompletePanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.panelSoft,
  },
  autocompleteRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  autocompleteRowSelected: {
    backgroundColor: colors.infoSoft,
  },
  autocompleteIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  autocompleteMain: {
    flex: 1,
    minWidth: 0,
  },
  autocompleteSize: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  autocompleteMeta: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
  },
  autocompleteQty: {
    color: colors.success,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  autocompleteQtyLabel: {
    color: colors.muted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  autocompleteStockPill: {
    minWidth: 54,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
  },
  button: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelSoft,
  },
  segmentSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  segmentTextSelected: {
    color: colors.primary,
  },
  alertDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertDangerText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertSuccessText: {
    color: colors.success,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  metricBadge: {
    width: 84,
    height: 42,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 7,
  },
  metricBadgeIcon: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricBadgeText: {
    flex: 1,
    minWidth: 0,
  },
  metricBadgeLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricBadgeValue: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.panelSoft,
  },
  stockRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stockRowSelected: {
    backgroundColor: colors.infoSoft,
  },
  stockSelectArea: {
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    minWidth: 0,
  },
  stockMain: {
    flex: 1,
    minWidth: 0,
  },
  stockSize: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  stockName: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 13,
  },
  stockNumbers: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  stockControls: {
    minWidth: 124,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  stockActionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stockActionButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  stockMinusButton: {
    borderColor: colors.danger,
  },
  stockPlusButton: {
    borderColor: colors.success,
  },
  stockActionButtonDisabled: {
    opacity: 0.35,
  },
  stockQty: {
    color: colors.success,
    fontSize: 25,
    fontWeight: '900',
  },
  stockQtyLabel: {
    color: colors.subtle,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyState: {
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyInline: {
    color: colors.muted,
    fontSize: 13,
    padding: spacing.md,
  },
  movementRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  movementIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementMain: {
    flex: 1,
    minWidth: 0,
  },
  movementTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  movementMeta: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
  },
  resultBalance: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    minWidth: 36,
    textAlign: 'right',
  },
});
