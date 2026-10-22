import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface ProjectSourceItem {
  sourceApp: string;
  sourceLabel: string;
  origin: string | null;
  description: string;
  bookingHandoffPath?: string | null;
  genericBookingHandoffPath?: string | null;
  assistedChatPopupLinked?: boolean;
  integrationSecretConfigured?: boolean;
  totalCount: number;
  activeCount: number;
  todayCount: number;
  latestCreatedAt: string | null;
  configured: boolean;
}

interface ProjectSourcesResponse {
  items: ProjectSourceItem[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenBookings: (sourceApp: string | null) => void;
  onOpenActiveJobs: (sourceApp: string | null) => void;
  onOpenStock: () => void;
  onOpenGarage: () => void;
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/London',
});

function formatDate(value: string | null): string {
  if (!value) return 'No bookings yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No bookings yet';
  return DATE_FMT.format(date);
}

function isExternalProject(item: ProjectSourceItem): boolean {
  return item.sourceApp !== 'tyre_rescue';
}

function isPopupLinked(item: ProjectSourceItem): boolean {
  return item.assistedChatPopupLinked ?? isExternalProject(item);
}

function isSecretReady(item: ProjectSourceItem): boolean {
  return item.integrationSecretConfigured ?? true;
}

export function ProjectSourcesModal({
  visible,
  onClose,
  onOpenBookings,
  onOpenActiveJobs,
  onOpenStock,
  onOpenGarage,
}: Props) {
  const [items, setItems] = useState<ProjectSourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<ProjectSourcesResponse>('/api/mobile/admin/project-sources');
      setItems(response.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const handle = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(handle);
  }, [visible, load]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.fullScreen}>
        <View style={styles.header}>
          <Text style={styles.title}>Projects</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.summaryBar}>
          <AppButton
            label="All bookings"
            variant="primary"
            onPress={() => onOpenBookings(null)}
            style={styles.summaryButton}
          />
          <AppButton
            label="All active jobs"
            variant="secondary"
            onPress={() => onOpenActiveJobs(null)}
            style={styles.summaryButton}
          />
          <AppButton
            label="Shared stock"
            variant="secondary"
            onPress={onOpenStock}
            style={styles.summaryButton}
          />
          <AppButton
            label="Driver stock"
            variant="secondary"
            onPress={onOpenGarage}
            style={styles.summaryButton}
          />
          <AppButton
            label="Refresh"
            variant="secondary"
            onPress={load}
            loading={loading}
            style={styles.summaryButton}
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <StatusBanner kind="err" message={error} />
            <AppButton label="Retry" variant="secondary" onPress={load} style={styles.retryBtn} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {items.map((item) => (
              <View key={item.sourceApp} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleBlock}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.sourceLabel}
                    </Text>
                    <Text style={styles.cardSource} numberOfLines={1}>
                      {item.sourceApp}
                    </Text>
                  </View>
                  <View style={styles.badges}>
                    <View style={[styles.configBadge, !item.configured && styles.configBadgeWarn]}>
                      <Text style={[styles.configText, !item.configured && styles.configTextWarn]}>
                        {item.configured ? 'Configured' : 'Unknown'}
                      </Text>
                    </View>
                    <View style={[
                      styles.configBadge,
                      isPopupLinked(item) ? styles.linkBadge : styles.directBadge,
                    ]}>
                      <Text style={[
                        styles.configText,
                        isPopupLinked(item) ? styles.linkText : styles.directText,
                      ]}>
                        {isPopupLinked(item) ? 'App linked' : 'Direct'}
                      </Text>
                    </View>
                    {item.bookingHandoffPath ? (
                      <View style={[
                        styles.configBadge,
                        isSecretReady(item) ? styles.secretReadyBadge : styles.configBadgeWarn,
                      ]}>
                        <Text style={[
                          styles.configText,
                          isSecretReady(item) ? styles.secretReadyText : styles.configTextWarn,
                        ]}>
                          {isSecretReady(item) ? 'Key ready' : 'Needs key'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>

                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{item.activeCount}</Text>
                    <Text style={styles.metricLabel}>Active</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{item.todayCount}</Text>
                    <Text style={styles.metricLabel}>Today</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{item.totalCount}</Text>
                    <Text style={styles.metricLabel}>Total</Text>
                  </View>
                </View>

                <Text style={styles.latestText}>Latest: {formatDate(item.latestCreatedAt)}</Text>

                <View style={styles.cardActions}>
                  <AppButton
                    label="Bookings"
                    variant="secondary"
                    onPress={() => onOpenBookings(item.sourceApp)}
                    style={styles.cardActionButton}
                  />
                  <AppButton
                    label="Active jobs"
                    variant="secondary"
                    onPress={() => onOpenActiveJobs(item.sourceApp)}
                    style={styles.cardActionButton}
                  />
                  <AppButton
                    label="Stock"
                    variant="secondary"
                    onPress={onOpenStock}
                    style={styles.cardActionButton}
                  />
                  <AppButton
                    label="Driver stock"
                    variant="secondary"
                    onPress={onOpenGarage}
                    style={styles.cardActionButton}
                  />
                </View>
              </View>
            ))}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: 52,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  closeBtn: {
    minHeight: 44,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: space.md,
  },
  closeText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryButton: {
    flexGrow: 1,
    flexBasis: 142,
    minHeight: 44,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  retryBtn: {
    minWidth: 120,
  },
  list: {
    padding: space.md,
    gap: space.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  cardSource: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  configBadge: {
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  configBadgeWarn: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  configText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  configTextWarn: {
    color: colors.warning,
  },
  badges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  linkBadge: {
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
  },
  linkText: {
    color: colors.info,
  },
  directBadge: {
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  directText: {
    color: colors.muted,
  },
  secretReadyBadge: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  secretReadyText: {
    color: colors.success,
  },
  description: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  metrics: {
    flexDirection: 'row',
    gap: space.sm,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  latestText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  cardActionButton: {
    flexGrow: 1,
    flexBasis: 112,
    minHeight: 44,
  },
  bottomSpacer: {
    height: space.xl,
  },
});
