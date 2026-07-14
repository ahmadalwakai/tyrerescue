import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { RecentCustomer } from '@/types/assisted-chat';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';
import { copyToClipboard } from '@/lib/clipboard';
import { summarizeBookingTyreLines } from '@/lib/assisted-chat-workflow';

interface Props {
  visible: boolean;
  items: RecentCustomer[];
  /** True when the current draft has any meaningful operator-entered data. */
  draftHasContent: boolean;
  onClose: () => void;
  onUseCustomer: (item: RecentCustomer) => void;
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

function buildDetailLines(item: RecentCustomer): string[] {
  const lines: string[] = [];
  if (item.customerPhone) lines.push(`Phone: ${item.customerPhone}`);
  if (item.customerAddress) lines.push(`Address: ${item.customerAddress}`);
  const tyreSummary = item.tyreLines?.length ? summarizeBookingTyreLines(item.tyreLines) : [];
  if (tyreSummary.length > 0) {
    lines.push('Tyres:');
    tyreSummary.forEach((line) => lines.push(`- ${line}`));
  } else {
    if (item.tyreSize) lines.push(`Tyre size: ${item.tyreSize}`);
    if (typeof item.quantity === 'number') lines.push(`Quantity: ${item.quantity}`);
  }
  if (item.note) lines.push(`Note: ${item.note}`);
  if (item.lastBookingReference) lines.push(`Last booking: ${item.lastBookingReference}`);
  lines.push(`Last used: ${formatWhen(item.lastUsedAtIso)}`);
  return lines;
}

export function RecentCustomersModal({
  visible,
  items,
  draftHasContent,
  onClose,
  onUseCustomer,
}: Props) {
  const [pendingUse, setPendingUse] = useState<RecentCustomer | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => Date.parse(b.lastUsedAtIso) - Date.parse(a.lastUsedAtIso),
      ),
    [items],
  );

  const handleClose = () => {
    setPendingUse(null);
    setCopyState('idle');
    onClose();
  };

  const handleUse = (item: RecentCustomer) => {
    if (draftHasContent) {
      setPendingUse(item);
      return;
    }
    onUseCustomer(item);
    handleClose();
  };

  const handleCopy = async (item: RecentCustomer) => {
    const ok = await copyToClipboard(buildDetailLines(item).join('\n'));
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Recent customers</Text>
              <Text style={styles.subtitle}>
                {sorted.length === 1
                  ? '1 saved customer'
                  : `${sorted.length} saved customers`}
              </Text>
            </View>
            <AppButton label="Close" variant="ghost" onPress={handleClose} />
          </View>

          {copyState !== 'idle' ? (
            <View style={{ marginTop: 8 }}>
              <StatusBanner
                kind={copyState === 'ok' ? 'ok' : 'err'}
                message={copyState === 'ok' ? 'Details copied.' : 'Could not copy.'}
              />
            </View>
          ) : null}

          {pendingUse ? (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                Replace current draft details with this customer?
              </Text>
              <View style={styles.actionsRow}>
                <AppButton
                  label="Replace draft"
                  variant="primary"
                  onPress={() => {
                    onUseCustomer(pendingUse);
                    setPendingUse(null);
                    handleClose();
                  }}
                  fullWidth
                />
                <AppButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setPendingUse(null)}
                  fullWidth
                />
              </View>
            </View>
          ) : sorted.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No recent customers yet.</Text>
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {sorted.map((item, idx) => (
                <View
                  key={`${item.customerPhone ?? 'noPhone'}-${item.customerAddress ?? 'noAddr'}-${idx}`}
                  style={styles.itemCard}
                >
                  {item.customerPhone ? (
                    <Text style={styles.itemPhone}>{item.customerPhone}</Text>
                  ) : null}
                  {item.customerAddress ? (
                    <Text style={styles.itemMeta} numberOfLines={2}>
                      {item.customerAddress}
                    </Text>
                  ) : null}
                  <Text style={styles.itemSub}>
                    {item.tyreLines?.length
                      ? summarizeBookingTyreLines(item.tyreLines).join(' · ')
                      : item.tyreSize
                      ? `${item.tyreSize}`
                      : 'No tyre size'}
                    {!item.tyreLines?.length && typeof item.quantity === 'number' ? ` · qty ${item.quantity}` : ''}
                    {' · '}
                    {formatWhen(item.lastUsedAtIso)}
                  </Text>
                  <View style={styles.itemActions}>
                    <AppButton
                      label="Use details"
                      variant="primary"
                      onPress={() => handleUse(item)}
                      fullWidth
                    />
                    <AppButton
                      label="Copy details"
                      variant="secondary"
                      onPress={() => handleCopy(item)}
                      fullWidth
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  body: { marginTop: 12 },
  bodyContent: { gap: 10, paddingBottom: 4 },
  emptyWrap: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },
  itemCard: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  itemPhone: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  itemMeta: { color: colors.text, fontSize: fontSize.sm },
  itemSub: { color: colors.subtle, fontSize: fontSize.xs },
  itemActions: { gap: 6, marginTop: 8 },
  confirmBox: {
    marginTop: 12,
    padding: 12,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    gap: 10,
  },
  confirmText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700' },
  actionsRow: { gap: 6 },
});
