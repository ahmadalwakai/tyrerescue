import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Accent = 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'muted';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const accentMap: Record<Accent, { color: string; bg: string; border: string }> = {
  orange: { color: colors.primary, bg: 'rgba(255, 122, 24, 0.16)', border: 'rgba(255, 122, 24, 0.35)' },
  blue: { color: colors.active, bg: colors.activeSoft, border: 'rgba(31, 139, 255, 0.35)' },
  green: { color: colors.success, bg: colors.successBg, border: 'rgba(45, 219, 117, 0.35)' },
  purple: { color: colors.tools, bg: colors.toolsSoft, border: 'rgba(168, 85, 247, 0.35)' },
  red: { color: colors.error, bg: colors.errorBg, border: 'rgba(255, 77, 79, 0.35)' },
  muted: { color: colors.textMuted, bg: colors.surfaceSoft, border: colors.border },
};

export const moneyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? moneyFormatter.format(parsed) : '';
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function humanLabel(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusAccent(status: string | null | undefined): Accent {
  const key = String(status ?? '').toLowerCase();
  if (['completed', 'paid', 'success', 'confirmed', 'available', 'online', 'on_time', 'moving', 'read'].includes(key)) {
    return 'green';
  }
  if (['assigned', 'in_progress', 'en_route', 'arrived', 'info', 'open', 'active'].includes(key)) return 'blue';
  if (['ai', 'tool', 'ready', 'replied'].includes(key)) return 'purple';
  if (['failed', 'error', 'late', 'urgent', 'critical', 'cancelled', 'offline', 'unread'].includes(key)) return 'red';
  if (['pending', 'awaiting_payment', 'warning', 'at_risk', 'busy'].includes(key)) return 'orange';
  return 'muted';
}

export function PressScale({
  children,
  onPress,
  disabled,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedPressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateTo(0.97)}
      onPressOut={() => animateTo(1)}
      style={[style, { transform: [{ scale }], opacity: disabled ? 0.55 : 1 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function AppHeader({
  title,
  subtitle,
  notificationCount,
  showBell = true,
  onMenuPress,
  onBellPress,
}: {
  title: string;
  subtitle?: string;
  notificationCount?: number;
  showBell?: boolean;
  onMenuPress?: () => void;
  onBellPress?: () => void;
}) {
  return (
    <View style={styles.header}>
      <PressScale style={styles.headerIconButton} onPress={onMenuPress} accessibilityLabel="Open menu">
        <Ionicons name="menu" size={22} color={colors.textSecondary} />
      </PressScale>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showBell ? (
        <PressScale style={styles.headerIconButton} onPress={onBellPress} accessibilityLabel="Open notifications">
          <Ionicons name="notifications-outline" size={21} color={colors.textSecondary} />
          {notificationCount && notificationCount > 0 ? <View style={styles.headerBellDot} /> : null}
        </PressScale>
      ) : (
        <View style={styles.headerIconButton} />
      )}
    </View>
  );
}

export function AdminShell({
  title,
  subtitle,
  notificationCount,
  children,
  contentStyle,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  notificationCount?: number;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fade] = useState(() => new Animated.Value(0));
  const [translate] = useState(() => new Animated.Value(16));

  useEffect(() => {
    fade.setValue(0);
    translate.setValue(16);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(translate, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [fade, translate, title]);

  const content = (
    <Animated.View style={[{ opacity: fade, transform: [{ translateY: translate }] }, !scroll && styles.flex]}>
      {children}
    </Animated.View>
  );

  return (
    <View style={styles.shell}>
      <View style={styles.bgTop} />
      <View style={styles.bgBottom} />
      <View style={[styles.shellHeader, { paddingTop: Math.max(insets.top, 10) }]}>
        <AppHeader
          title={title}
          subtitle={subtitle}
          notificationCount={notificationCount}
          onMenuPress={() => router.push('/(tabs)/more')}
          onBellPress={() => router.push('/(tabs)/ops/notifications')}
        />
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.shellContent,
            { paddingBottom: 94 + Math.max(insets.bottom, 8) },
            contentStyle,
          ]}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.shellContentFixed, { paddingBottom: 84 + Math.max(insets.bottom, 8) }, contentStyle]}>
          {content}
        </View>
      )}
    </View>
  );
}

export function GlassCard({
  children,
  style,
  accent = 'muted',
  urgent = false,
  animatedIndex,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: Accent;
  urgent?: boolean;
  animatedIndex?: number;
  onPress?: () => void;
}) {
  const [fade] = useState(() => new Animated.Value(animatedIndex === undefined ? 1 : 0));
  const [translate] = useState(() => new Animated.Value(animatedIndex === undefined ? 0 : 14));

  useEffect(() => {
    if (animatedIndex === undefined) return;
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        delay: animatedIndex * 55,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.spring(translate, {
        toValue: 0,
        delay: animatedIndex * 55,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animatedIndex, fade, translate]);

  const accentTokens = accentMap[urgent ? 'red' : accent];
  const body = (
    <Animated.View
      style={[
        styles.glassCard,
        { borderColor: accentTokens.border },
        urgent && styles.urgentCard,
        style,
        { opacity: fade, transform: [{ translateY: translate }] },
      ]}
    >
      {children}
    </Animated.View>
  );

  if (!onPress) return body;
  return <PressScale onPress={onPress}>{body}</PressScale>;
}

export function MetricCard({
  label,
  value,
  helper,
  icon,
  accent = 'blue',
  animatedIndex,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: IconName;
  accent?: Accent;
  animatedIndex?: number;
}) {
  const tokens = accentMap[accent];
  return (
    <GlassCard style={styles.metricCard} accent={accent} animatedIndex={animatedIndex}>
      <View style={[styles.metricIcon, { backgroundColor: tokens.bg }]}>
        <Ionicons name={icon} size={17} color={tokens.color} />
      </View>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {helper ? (
        <Text style={[styles.metricHelper, { color: tokens.color }]} numberOfLines={1}>
          {helper}
        </Text>
      ) : null}
    </GlassCard>
  );
}

export function StatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const accent = statusAccent(status);
  const tokens = accentMap[accent];
  return (
    <View style={[styles.statusBadge, { backgroundColor: tokens.bg, borderColor: tokens.border }]}>
      <View style={[styles.statusDot, { backgroundColor: tokens.color }]} />
      <Text style={[styles.statusText, { color: tokens.color }]} numberOfLines={1}>
        {label || humanLabel(status) || 'Unknown'}
      </Text>
    </View>
  );
}

export function FilterChip({
  label,
  active,
  onPress,
  accent = 'blue',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  accent?: Accent;
}) {
  const tokens = accentMap[accent];
  return (
    <PressScale
      onPress={onPress}
      style={[
        styles.filterChip,
        active && { backgroundColor: tokens.bg, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.filterChipText, active && { color: tokens.color }]} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onFilterPress?: () => void;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>
      {onFilterPress ? (
        <PressScale style={styles.searchFilterButton} onPress={onFilterPress} accessibilityLabel="Filter">
          <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
        </PressScale>
      ) : null}
    </View>
  );
}

export function QuickActionCard({
  title,
  subtitle,
  icon,
  accent = 'orange',
  onPress,
  animatedIndex,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  accent?: Accent;
  onPress: () => void;
  animatedIndex?: number;
}) {
  const tokens = accentMap[accent];
  return (
    <PressScale onPress={onPress} style={styles.quickActionPressable} accessibilityLabel={title}>
      <GlassCard style={styles.quickActionCard} accent={accent} animatedIndex={animatedIndex}>
        <View style={[styles.quickIcon, { backgroundColor: tokens.bg }]}>
          <Ionicons name={icon} size={20} color={tokens.color} />
        </View>
        <Text style={styles.quickActionTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.quickActionSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </GlassCard>
    </PressScale>
  );
}

export function BookingCard({
  refNumber,
  customerName,
  serviceType,
  status,
  scheduledAt,
  totalAmount,
  driverLabel,
  onPress,
  animatedIndex,
}: {
  refNumber: string;
  customerName?: string | null;
  serviceType?: string | null;
  status?: string | null;
  scheduledAt?: string | null;
  totalAmount?: string | number | null;
  driverLabel?: string | null;
  onPress?: () => void;
  animatedIndex?: number;
}) {
  const money = formatMoney(totalAmount);
  return (
    <GlassCard onPress={onPress} animatedIndex={animatedIndex} accent={statusAccent(status)} urgent={statusAccent(status) === 'red'}>
      <View style={styles.cardTopRow}>
        <View style={styles.flex}>
          <Text style={styles.cardRef} numberOfLines={1}>
            {refNumber}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {customerName || 'Customer not set'}
          </Text>
        </View>
        <StatusBadge status={status} />
      </View>
      <View style={styles.infoRow}>
        <Ionicons name="construct-outline" size={14} color={colors.textMuted} />
        <Text style={styles.infoText} numberOfLines={1}>
          {serviceType || 'Service not set'}
        </Text>
      </View>
      <View style={styles.cardBottomRow}>
        <Text style={styles.mutedText} numberOfLines={1}>
          {formatShortDate(scheduledAt) || 'No schedule'}
        </Text>
        {money ? <Text style={styles.moneyText}>{money}</Text> : null}
      </View>
      {driverLabel ? (
        <Text style={styles.tinyText} numberOfLines={1}>
          {driverLabel}
        </Text>
      ) : null}
    </GlassCard>
  );
}

export function JobCard({
  title,
  subtitle,
  status,
  driverName,
  metric,
  onPress,
  animatedIndex,
}: {
  title: string;
  subtitle?: string | null;
  status?: string | null;
  driverName?: string | null;
  metric?: string | null;
  onPress?: () => void;
  animatedIndex?: number;
}) {
  return (
    <GlassCard onPress={onPress} animatedIndex={animatedIndex} accent={statusAccent(status)} urgent={statusAccent(status) === 'red'}>
      <View style={styles.cardTopRow}>
        <View style={styles.avatarBadge}>
          <Ionicons name="briefcase" size={18} color={colors.text} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.mutedText} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={status} />
      </View>
      <View style={styles.routeMetricRow}>
        <View style={styles.routeMetric}>
          <Ionicons name="person-circle-outline" size={16} color={colors.active} />
          <Text style={styles.infoText} numberOfLines={1}>
            {driverName || 'No driver'}
          </Text>
        </View>
        {metric ? (
          <View style={styles.routeMetric}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.infoText} numberOfLines={1}>
              {metric}
            </Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

export function DriverCard({
  name,
  status,
  phone,
  activeJobRef,
  situationLabel,
  onPress,
  onCallPress,
  animatedIndex,
}: {
  name: string;
  status?: string | null;
  phone?: string | null;
  activeJobRef?: string | null;
  situationLabel?: string | null;
  onPress?: () => void;
  onCallPress?: () => void;
  animatedIndex?: number;
}) {
  return (
    <GlassCard style={styles.driverCard} onPress={onPress} animatedIndex={animatedIndex} accent={statusAccent(status)}>
      <View style={styles.driverAvatar}>
        <Ionicons name="person" size={22} color={colors.text} />
        <View style={[styles.onlineDot, { backgroundColor: statusAccent(status) === 'green' ? colors.success : colors.textSubtle }]} />
      </View>
      <View style={styles.flex}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {name}
          </Text>
          <StatusBadge status={status} />
        </View>
        <Text style={styles.mutedText} numberOfLines={1}>
          {activeJobRef ? `Current job ${activeJobRef}` : 'No active job'}
        </Text>
        {situationLabel ? (
          <Text style={styles.tinyText} numberOfLines={1}>
            {situationLabel}
          </Text>
        ) : null}
      </View>
      <PressScale
        disabled={!phone || !onCallPress}
        onPress={onCallPress}
        style={styles.callButton}
        accessibilityLabel="Call driver"
      >
        <Ionicons name="call" size={18} color={colors.text} />
      </PressScale>
    </GlassCard>
  );
}

export function AlertCard({
  title,
  body,
  severity,
  isRead,
  createdAt,
  animatedIndex,
}: {
  title: string;
  body?: string | null;
  severity?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
  animatedIndex?: number;
}) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isRead) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRead, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });
  const accent = isRead ? 'blue' : statusAccent(severity || 'urgent');
  const tokens = accentMap[accent];

  return (
    <GlassCard animatedIndex={animatedIndex} accent={accent} urgent={!isRead && accent === 'red'}>
      <View style={styles.alertRow}>
        <View style={[styles.alertIcon, { backgroundColor: tokens.bg }]}>
          <Ionicons name={accent === 'red' ? 'alert-circle' : 'notifications'} size={19} color={tokens.color} />
        </View>
        <View style={styles.flex}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
            {!isRead ? (
              <View style={styles.unreadDotWrap}>
                <Animated.View
                  style={[styles.unreadPulse, { backgroundColor: tokens.color, opacity, transform: [{ scale }] }]}
                />
                <View style={[styles.unreadDot, { backgroundColor: tokens.color }]} />
              </View>
            ) : null}
          </View>
          {body ? (
            <Text style={styles.mutedText} numberOfLines={2}>
              {body}
            </Text>
          ) : null}
          <Text style={styles.tinyText}>{formatShortDate(createdAt)}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

export function ToolCard({
  title,
  subtitle,
  icon,
  accent = 'purple',
  onPress,
  animatedIndex,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  accent?: Accent;
  onPress?: () => void;
  animatedIndex?: number;
}) {
  const tokens = accentMap[accent];
  return (
    <GlassCard style={styles.toolCard} onPress={onPress} accent={accent} animatedIndex={animatedIndex}>
      <View style={[styles.toolIcon, { backgroundColor: tokens.bg }]}>
        <Ionicons name={icon} size={22} color={tokens.color} />
      </View>
      <Text style={styles.quickTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.quickSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </GlassCard>
  );
}

export function ProgressRing({
  value,
  label,
  accent = 'green',
}: {
  value: number;
  label?: string;
  accent?: Accent;
}) {
  const [animated] = useState(() => new Animated.Value(0));
  const clamped = Math.max(0, Math.min(100, value));
  const tokens = accentMap[accent];

  useEffect(() => {
    Animated.timing(animated, {
      toValue: clamped,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [animated, clamped]);

  const width = animated.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.progressWrap}>
      <View style={[styles.progressCircle, { borderColor: tokens.color }]}>
        <Text style={styles.progressValue}>{Math.round(clamped)}%</Text>
        {label ? <Text style={styles.progressLabel}>{label}</Text> : null}
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width, backgroundColor: tokens.color }]} />
      </View>
    </View>
  );
}

export function MiniChart({
  data,
  accent = 'blue',
}: {
  data: number[];
  accent?: Accent;
}) {
  const tokens = accentMap[accent];
  const normalized = useMemo(() => {
    const max = Math.max(...data, 1);
    return data.map((value) => Math.max(8, Math.round((value / max) * 72)));
  }, [data]);

  if (!data.length) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.mutedText}>No chart data</Text>
      </View>
    );
  }

  return (
    <View style={styles.chart}>
      {normalized.map((height, index) => (
        <View key={`${height}-${index}`} style={styles.chartBarTrack}>
          <Animated.View style={[styles.chartBar, { height, backgroundColor: index === normalized.length - 1 ? colors.primary : tokens.color }]} />
        </View>
      ))}
    </View>
  );
}

export function StatePanel({
  loading,
  error,
  empty,
  emptyLabel = 'No results yet.',
  onRetry,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
}) {
  if (!loading && !error && !empty) return null;
  return (
    <GlassCard style={styles.statePanel} accent={error ? 'red' : 'blue'}>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? (
        <>
          <Ionicons name="warning-outline" size={22} color={colors.error} />
          <Text style={styles.stateText}>{error}</Text>
          {onRetry ? (
            <PressScale style={styles.retryButton} onPress={onRetry}>
              <Text style={styles.retryText}>Retry</Text>
            </PressScale>
          ) : null}
        </>
      ) : null}
      {empty && !loading && !error ? (
        <>
          <Ionicons name="file-tray-outline" size={22} color={colors.textMuted} />
          <Text style={styles.stateText}>{emptyLabel}</Text>
        </>
      ) : null}
    </GlassCard>
  );
}

const navItems: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  dashboard: { label: 'Dashboard', icon: 'home-outline', activeIcon: 'home' },
  bookings: { label: 'Bookings', icon: 'calendar-outline', activeIcon: 'calendar' },
  ops: { label: 'Jobs', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  drivers: { label: 'Drivers', icon: 'people-outline', activeIcon: 'people' },
  more: { label: 'More', icon: 'grid-outline', activeIcon: 'grid' },
};

export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const visible = state.routes.filter((route) => navItems[route.name]);
  const currentRouteName = state.routes[state.index]?.name;

  return (
    <View style={[styles.navOuter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.navBar}>
        {visible.map((route) => {
          const config = navItems[route.name];
          const focused = route.name === currentRouteName;
          return (
            <PressScale
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={[styles.navItem, focused && styles.navItemActive]}
              accessibilityLabel={config.label}
            >
              <Ionicons
                name={focused ? config.activeIcon : config.icon}
                size={20}
                color={focused ? colors.active : colors.textMuted}
              />
              <Text style={[styles.navLabel, focused && styles.navLabelActive]} numberOfLines={1}>
                {config.label}
              </Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bgTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
    backgroundColor: colors.bgNavy,
  },
  bgBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: colors.bg,
  },
  shellHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  shellContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  shellContentFixed: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  headerBellDot: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  glassCard: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  urgentCard: {
    shadowColor: colors.error,
    shadowOpacity: 0.28,
    elevation: 9,
  },
  metricCard: {
    width: '48%',
    minHeight: 116,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: typography.weight.medium,
  },
  metricValue: {
    marginTop: 3,
    color: colors.text,
    fontSize: 22,
    fontWeight: typography.weight.bold,
  },
  metricHelper: {
    marginTop: spacing.xs,
    fontSize: 10,
    fontWeight: typography.weight.semibold,
  },
  statusBadge: {
    minHeight: 24,
    maxWidth: 132,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: typography.weight.bold,
  },
  filterChip: {
    minHeight: 34,
    minWidth: 54,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchFilterButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  quickActionCard: {
    width: '100%',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  quickActionPressable: {
    flex: 1,
    minWidth: 0,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickActionTitle: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    minHeight: 24,
    width: '100%',
  },
  quickActionSubtitle: {
    color: colors.textMuted,
    fontSize: 8,
    lineHeight: 10,
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
  },
  quickTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  quickSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardRef: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    minWidth: 0,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  tinyText: {
    color: colors.textSubtle,
    fontSize: 10,
    marginTop: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  infoText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    minWidth: 0,
  },
  cardBottomRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  moneyText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  avatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.activeSoft,
  },
  routeMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  routeMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  alertIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toolCard: {
    width: '48%',
    minHeight: 118,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  progressWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  progressValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  progressLabel: {
    color: colors.textMuted,
    fontSize: 9,
    marginTop: 1,
  },
  progressTrack: {
    width: 86,
    height: 5,
    borderRadius: 5,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  chart: {
    height: 94,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
    paddingTop: spacing.md,
  },
  chartBarTrack: {
    flex: 1,
    height: 82,
    justifyContent: 'flex-end',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    borderTopLeftRadius: radius.full,
    borderTopRightRadius: radius.full,
  },
  emptyChart: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statePanel: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  navOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(2, 7, 18, 0.72)',
  },
  navBar: {
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 12,
  },
  navItem: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navItemActive: {
    backgroundColor: colors.activeSoft,
  },
  navLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: typography.weight.semibold,
  },
  navLabelActive: {
    color: colors.active,
  },
});
