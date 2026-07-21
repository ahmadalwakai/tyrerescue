import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TodayBookingItem } from '@/hooks/useTodayBookings';
import type { AssistedChatPaymentChoice } from '@/types/assisted-chat';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';
import { copyToClipboard } from '@/lib/clipboard';
import { formatGbp } from '@/lib/money';
import { formatAssistedChatServiceType } from '@/lib/assisted-chat-workflow';

interface Props {
  visible: boolean;
  items: TodayBookingItem[];
  onClose: () => void;
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const PAYMENT_LABEL: Record<AssistedChatPaymentChoice, string> = {
  deposit: 'Deposit 20%',
  cash: 'Cash',
  full: 'Full payment',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return TIME_FMT.format(d);
}

function formatTotal(item: TodayBookingItem): string | null {
  if (typeof item.totalPence === 'number' && Number.isFinite(item.totalPence)) {
    return formatGbp(item.totalPence / 100);
  }
  if (item.totalLabel) return item.totalLabel;
  return null;
}

interface DailySummary {
  total: number;
  cash: number;
  deposit: number;
  full: number;
  revenuePence: number;
  missingTotals: number;
}

function summarize(items: TodayBookingItem[]): DailySummary {
  const s: DailySummary = {
    total: items.length,
    cash: 0,
    deposit: 0,
    full: 0,
    revenuePence: 0,
    missingTotals: 0,
  };
  for (const i of items) {
    if (i.paymentChoice === 'cash') s.cash += 1;
    else if (i.paymentChoice === 'deposit') s.deposit += 1;
    else if (i.paymentChoice === 'full') s.full += 1;
    if (typeof i.totalPence === 'number' && Number.isFinite(i.totalPence)) {
      s.revenuePence += i.totalPence;
    } else {
      s.missingTotals += 1;
    }
  }
  return s;
}

function buildDetailLines(item: TodayBookingItem): string[] {
  const lines: string[] = [];
  lines.push(`Booking ref: ${item.bookingReference}`);
  lines.push(`Date: ${formatDate(item.createdAtIso)}`);
  lines.push(`Service: ${formatAssistedChatServiceType(item.serviceType)}`);
  const t = formatTime(item.createdAtIso);
  if (t) lines.push(`Time: ${t}`);
  if (item.customerPhone) lines.push(`Phone: ${item.customerPhone}`);
  if (item.customerAddress) lines.push(`Address: ${item.customerAddress}`);
  if (item.tyreSize) lines.push(`Tyre size: ${item.tyreSize}`);
  if (typeof item.quantity === 'number') lines.push(`Quantity: ${item.quantity}`);
  lines.push(`Payment: ${PAYMENT_LABEL[item.paymentChoice]}`);
  if (item.paymentLink) lines.push(`Payment link: ${item.paymentLink}`);
  const total = formatTotal(item);
  if (total) lines.push(`Total: ${total}`);
  return lines;
}

export function TodayBookingsModal({ visible, items, onClose }: Props) {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  // When the list changes (e.g. a new booking arrives while the modal is open)
  // the previously-selected reference may no longer exist. Resolve every render
  // so we always render the latest version of the chosen item.
  const selected = useMemo(
    () => (selectedRef ? items.find((i) => i.bookingReference === selectedRef) ?? null : null),
    [items, selectedRef],
  );
  const summary = useMemo(() => summarize(items), [items]);

  const handleClose = () => {
    setSelectedRef(null);
    setCopyState('idle');
    onClose();
  };

  const flashCopy = (ok: boolean) => {
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleCopyReference = async (item: TodayBookingItem) => {
    const ok = await copyToClipboard(item.bookingReference);
    flashCopy(ok);
  };

  const handleCopyDetails = async (item: TodayBookingItem) => {
    const ok = await copyToClipboard(buildDetailLines(item).join('\n'));
    flashCopy(ok);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        {/* Inner pressable swallows taps so the sheet itself doesn't dismiss. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Today&apos;s bookings</Text>
              <Text style={styles.subtitle}>
                {items.length === 1
                  ? '1 booking created today'
                  : `${items.length} bookings created today`}
              </Text>
            </View>
            <AppButton label="Close" variant="danger" onPress={handleClose} />
          </View>

          {copyState !== 'idle' ? (
            <View style={{ marginTop: 8 }}>
              <StatusBanner
                kind={copyState === 'ok' ? 'ok' : 'err'}
                message={copyState === 'ok' ? 'Copied to clipboard.' : 'Could not copy.'}
              />
            </View>
          ) : null}

          {!selected && items.length > 0 ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bookings today</Text>
                <Text style={styles.summaryValue}>{summary.total}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Cash</Text>
                <Text style={styles.summaryValue}>{summary.cash}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Deposit</Text>
                <Text style={styles.summaryValue}>{summary.deposit}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Full payment</Text>
                <Text style={styles.summaryValue}>{summary.full}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabelStrong}>Estimated revenue</Text>
                <Text style={styles.summaryValueStrong}>
                  {formatGbp(summary.revenuePence / 100)}
                </Text>
              </View>
              {summary.missingTotals > 0 ? (
                <Text style={styles.summaryNote}>
                  Some totals unavailable.
                </Text>
              ) : null}
            </View>
          ) : null}

          {selected ? (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <View style={styles.detailCard}>
                <DetailRow label="Reference" value={selected.bookingReference} mono />
                <DetailRow label="Date" value={formatDate(selected.createdAtIso)} />
                <DetailRow label="Time" value={formatTime(selected.createdAtIso)} />
                <DetailRow label="Service" value={formatAssistedChatServiceType(selected.serviceType)} />
                {selected.customerPhone ? (
                  <DetailRow label="Phone" value={selected.customerPhone} />
                ) : null}
                {selected.customerAddress ? (
                  <DetailRow label="Address" value={selected.customerAddress} />
                ) : null}
                {selected.tyreSize ? (
                  <DetailRow label="Tyre size" value={selected.tyreSize} />
                ) : null}
                {typeof selected.quantity === 'number' ? (
                  <DetailRow label="Quantity" value={String(selected.quantity)} />
                ) : null}
                <DetailRow label="Payment" value={PAYMENT_LABEL[selected.paymentChoice]} />
                {selected.paymentLink ? (
                  <DetailRow label="Payment link" value={selected.paymentLink} />
                ) : null}
                {formatTotal(selected) ? (
                  <DetailRow label="Total" value={formatTotal(selected) ?? ''} />
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                <AppButton
                  label="Copy reference"
                  variant="secondary"
                  onPress={() => handleCopyReference(selected)}
                  fullWidth
                />
                <AppButton
                  label="Copy details"
                  variant="secondary"
                  onPress={() => handleCopyDetails(selected)}
                  fullWidth
                />
                <AppButton
                  label="Back to list"
                  variant="ghost"
                  onPress={() => setSelectedRef(null)}
                  fullWidth
                />
              </View>
            </ScrollView>
          ) : items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No bookings created today yet.</Text>
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {items.map((item) => {
                const total = formatTotal(item);
                return (
                  <Pressable
                    key={item.bookingReference}
                    style={({ pressed }) => [
                      styles.itemCard,
                      pressed && styles.itemCardPressed,
                    ]}
                    onPress={() => setSelectedRef(item.bookingReference)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open booking ${item.bookingReference}`}
                  >
                    <View style={styles.itemHeaderRow}>
                      <Text style={styles.itemRef}>{item.bookingReference}</Text>
                      <Text style={styles.itemTime}>{formatTime(item.createdAtIso)}</Text>
                    </View>
                    <Text style={styles.itemMeta}>
                      {formatDate(item.createdAtIso)} · {formatAssistedChatServiceType(item.serviceType)} · {PAYMENT_LABEL[item.paymentChoice]}
                      {total ? ` · ${total}` : ''}
                    </Text>
                    {item.customerAddress ? (
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {item.customerAddress}
                      </Text>
                    ) : null}
                    {item.customerPhone ? (
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {item.customerPhone}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailRow({ label, value, mono }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailValueMono]}>{value}</Text>
    </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  body: { marginTop: 12 },
  bodyContent: { gap: 8, paddingBottom: 4 },
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
  itemCardPressed: { borderColor: colors.borderStrong, backgroundColor: colors.card },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemRef: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  itemTime: { color: colors.muted, fontSize: fontSize.xs },
  itemMeta: { color: colors.text, fontSize: fontSize.sm },
  itemSub: { color: colors.subtle, fontSize: fontSize.xs },
  detailCard: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: { color: colors.muted, fontSize: fontSize.xs, width: 78 },
  detailValue: { color: colors.text, fontSize: fontSize.sm, flex: 1, flexWrap: 'wrap' },
  detailValueMono: { color: colors.accent, fontWeight: '700' },
  actionsRow: { gap: 8, marginTop: 12 },
  summaryCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { color: colors.muted, fontSize: fontSize.xs },
  summaryValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  summaryLabelStrong: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  summaryValueStrong: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  summaryNote: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 4 },
});
