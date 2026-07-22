import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '@/lib/api';
import {
  importVirtualLandlineCsv,
  previewVirtualLandlineCsv,
  type PickedCsvAsset,
} from '@/lib/virtual-landline';
import type {
  VirtualLandlineDraftResponse,
  VirtualLandlineImportResponse,
  VirtualLandlineInteraction,
  VirtualLandlineInteractionsResponse,
  VirtualLandlinePreviewResponse,
} from '@/types/virtual-landline';
import { AppIcon } from './icons/AppIcon';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

export interface VirtualLandlineDraftPrefill {
  phone: string;
  interactionId: string;
  matchedCustomer: VirtualLandlineDraftResponse['draft']['matchedCustomer'];
}

interface VirtualLandlineModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateDraft: (draft: VirtualLandlineDraftPrefill) => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
type ImportState = 'idle' | 'previewing' | 'preview' | 'importing' | 'imported' | 'error';

const FILTERS: Array<{ label: string; direction: string; reviewed: string }> = [
  { label: 'Missed queue', direction: 'missed', reviewed: 'false' },
  { label: 'All calls', direction: 'all', reviewed: 'all' },
  { label: 'Incoming', direction: 'incoming', reviewed: 'all' },
  { label: 'Outgoing', direction: 'outgoing', reviewed: 'all' },
  { label: 'Reviewed', direction: 'all', reviewed: 'true' },
];

function directionLabel(direction: string): string {
  if (direction === 'incoming') return 'Incoming';
  if (direction === 'outgoing') return 'Outgoing';
  if (direction === 'missed') return 'Missed';
  return 'Unknown';
}

function directionTone(direction: string) {
  if (direction === 'missed') return { color: colors.danger, border: colors.dangerBorder, bg: colors.dangerBg };
  if (direction === 'incoming') return { color: colors.success, border: colors.successBorder, bg: colors.successBg };
  if (direction === 'outgoing') return { color: colors.info, border: colors.infoBorder, bg: colors.infoBg };
  return { color: colors.muted, border: colors.border, bg: colors.surfaceElevated };
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return 'No number';
  if (/^44\d{9,10}$/.test(phone)) return `+${phone}`;
  return phone;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'No duration';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    return `${hours}h ${rest}m`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function formatCost(costRaw: string | null | undefined): string | null {
  if (!costRaw) return null;
  const normalized = costRaw.replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return costRaw;
  return `£${amount.toFixed(2)}`;
}

function interactionStateLabel(interaction: VirtualLandlineInteraction): string {
  if (interaction.linkedQuickBooking?.bookingId) return 'Booking created';
  if (interaction.linkedBooking) return 'Linked';
  if (interaction.linkedQuickBooking) return 'Draft created';
  if (interaction.reviewed) return 'Reviewed';
  return 'New';
}

function detectedColumnList(preview: VirtualLandlinePreviewResponse): string[] {
  return Object.entries(preview.detectedColumns)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`);
}

export function VirtualLandlineModal({ visible, onClose, onCreateDraft }: VirtualLandlineModalProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [items, setItems] = useState<VirtualLandlineInteraction[]>([]);
  const [pendingMissedCount, setPendingMissedCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filterIndex, setFilterIndex] = useState(0);
  const [preview, setPreview] = useState<VirtualLandlinePreviewResponse | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<PickedCsvAsset | null>(null);
  const [importResult, setImportResult] = useState<VirtualLandlineImportResponse | null>(null);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null>(null);
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const currentFilter = FILTERS[filterIndex] ?? FILTERS[0];

  const loadInteractions = useCallback(async () => {
    setLoadState('loading');
    setMessage(null);
    try {
      const params = new URLSearchParams({
        page: '1',
        perPage: '50',
        direction: currentFilter.direction,
        reviewed: currentFilter.reviewed,
      });
      if (search.trim()) params.set('search', search.trim());
      const response = await api.get<VirtualLandlineInteractionsResponse>(
        `/api/mobile/admin/virtual-landline/interactions?${params.toString()}`,
      );
      setItems(response.items);
      setPendingMissedCount(response.pendingMissedCount);
      setLoadState('loaded');
      if (response.previewMode) {
        setMessage({
          kind: 'info',
          text: response.message || 'Virtual Landline is in Preview Mode. Import and booking actions are disabled.',
        });
      }
    } catch (error) {
      setLoadState('error');
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Server error loading calls.' });
    }
  }, [currentFilter.direction, currentFilter.reviewed, search]);

  useEffect(() => {
    if (!visible) return;
    void loadInteractions();
  }, [loadInteractions, visible]);

  const pickCsv = useCallback(async () => {
    setMessage(null);
    setPreview(null);
    setSelectedAsset(null);
    setImportResult(null);
    setImportState('previewing');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        setImportState('idle');
        return;
      }
      const asset = result.assets[0] as PickedCsvAsset;
      const response = await previewVirtualLandlineCsv(asset);
      setSelectedAsset(asset);
      setPreview(response);
      setImportState(response.state === 'invalid_csv' || response.state === 'empty_history' ? 'error' : 'preview');
      if (response.state === 'empty_history') {
        setMessage({ kind: 'warn', text: 'Empty history: no call rows were found in this CSV.' });
      } else if (response.state === 'invalid_csv') {
        setMessage({ kind: 'err', text: 'Invalid CSV: no valid call rows were detected.' });
      } else if (response.state === 'partial_preview') {
        setMessage({ kind: 'warn', text: 'Preview has invalid or duplicate rows. Valid rows can be imported after review.' });
      } else {
        setMessage({ kind: 'info', text: 'CSV preview ready. Review the mapping and confirm import when ready.' });
      }
    } catch (error) {
      setImportState('error');
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Invalid CSV.' });
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!selectedAsset || !preview || preview.validRows <= 0) {
      setMessage({ kind: 'warn', text: 'Preview a valid Virtual Landline CSV before importing.' });
      return;
    }

    setImportState('importing');
    setMessage(null);
    try {
      const response = await importVirtualLandlineCsv(selectedAsset);
      setImportResult(response);
      setImportState('imported');
      const kind = response.state === 'succeeded' ? 'ok' : response.state === 'duplicate_rows' ? 'info' : 'warn';
      setMessage({
        kind,
        text: `Import complete: ${response.imported} new, ${response.duplicate} duplicate, ${response.invalid} invalid.`,
      });
      await loadInteractions();
    } catch (error) {
      setImportState('error');
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Import failed.' });
    }
  }, [loadInteractions, preview, selectedAsset]);

  const handleCallBack = useCallback((interaction: VirtualLandlineInteraction) => {
    const phone = formatPhone(interaction.customerPhoneNormalized);
    if (phone === 'No number') return;
    void Linking.openURL(`tel:${phone}`);
  }, []);

  const handleOpenRecording = useCallback((interaction: VirtualLandlineInteraction) => {
    if (!interaction.recordingUrl) return;
    void Linking.openURL(interaction.recordingUrl);
  }, []);

  const handleCreateDraft = useCallback(async (interaction: VirtualLandlineInteraction) => {
    setBusyActionId(interaction.id);
    setMessage(null);
    try {
      const response = await api.post<VirtualLandlineDraftResponse>(
        `/api/mobile/admin/virtual-landline/interactions/${interaction.id}/draft`,
      );
      onCreateDraft(response.draft);
      setMessage({ kind: 'ok', text: 'Draft prepared from Virtual Landline call.' });
      onClose();
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Could not create draft.' });
    } finally {
      setBusyActionId(null);
    }
  }, [onClose, onCreateDraft]);

  const handleMarkReviewed = useCallback(async (interaction: VirtualLandlineInteraction) => {
    setBusyActionId(interaction.id);
    setMessage(null);
    try {
      await api.patch(`/api/mobile/admin/virtual-landline/interactions/${interaction.id}`, {
        action: 'mark_reviewed',
      });
      setMessage({ kind: 'ok', text: 'Call marked reviewed.' });
      await loadInteractions();
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Could not mark reviewed.' });
    } finally {
      setBusyActionId(null);
    }
  }, [loadInteractions]);

  const handleLinkBooking = useCallback(async (interaction: VirtualLandlineInteraction) => {
    const bookingRef = (linkInputs[interaction.id] || '').trim();
    if (!bookingRef) {
      setMessage({ kind: 'warn', text: 'Enter a booking reference before linking.' });
      return;
    }
    setBusyActionId(interaction.id);
    setMessage(null);
    try {
      await api.patch(`/api/mobile/admin/virtual-landline/interactions/${interaction.id}`, {
        action: 'link_booking',
        bookingRef,
      });
      setMessage({ kind: 'ok', text: 'Call linked to booking.' });
      setLinkInputs((prev) => ({ ...prev, [interaction.id]: '' }));
      await loadInteractions();
    } catch (error) {
      setMessage({ kind: 'err', text: error instanceof Error ? error.message : 'Could not link booking.' });
    } finally {
      setBusyActionId(null);
    }
  }, [linkInputs, loadInteractions]);

  const summaryText = useMemo(() => {
    if (loadState === 'loading') return 'Loading call history...';
    if (loadState === 'error') return 'Server error';
    if (items.length === 0 && search.trim()) return 'Search results: no calls found';
    if (items.length === 0) return 'No imported interactions yet';
    return `${items.length} call${items.length === 1 ? '' : 's'} shown`;
  }, [items.length, loadState, search]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.headerIcon}>
              <AppIcon name="phone" size={18} color={colors.accent} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>More</Text>
              <Text style={styles.title}>Virtual Landline</Text>
            </View>
          </View>
          <AppButton label="Close" variant="danger" onPress={onClose} style={styles.closeButton} />
        </View>

        {message ? <StatusBanner kind={message.kind} message={message.text} /> : null}

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.importCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>CSV import</Text>
                <Text style={styles.cardSubtitle}>Preview exported call history, review the mapping, then confirm import.</Text>
              </View>
              {importState === 'previewing' || importState === 'importing' ? (
                <ActivityIndicator color={colors.accent} />
              ) : null}
            </View>

            <View style={styles.importActions}>
              <AppButton
                label="Select CSV"
                variant="secondary"
                onPress={pickCsv}
                disabled={importState === 'previewing' || importState === 'importing'}
              />
              <AppButton
                label={importState === 'importing' ? 'Importing...' : 'Confirm Import'}
                onPress={() => void handleConfirmImport()}
                disabled={!selectedAsset || !preview || preview.validRows <= 0 || importState === 'previewing' || importState === 'importing'}
                loading={importState === 'importing'}
              />
            </View>

            {preview ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>{preview.fileName}</Text>
                <View style={styles.metricsRow}>
                  <Metric label="Total" value={String(preview.totalRows)} />
                  <Metric label="Valid" value={String(preview.validRows)} />
                  <Metric label="Invalid" value={String(preview.invalidRows)} tone="warn" />
                  <Metric label="Duplicate" value={String(preview.duplicateRows)} tone="danger" />
                  <Metric label="Incoming" value={String(preview.counts.incoming)} tone="info" />
                  <Metric label="Outgoing" value={String(preview.counts.outgoing)} tone="info" />
                  <Metric label="Missed" value={String(preview.counts.missed)} tone="danger" />
                  <Metric label="Recordings" value={String(preview.counts.recordingRows)} />
                  <Metric label="Withheld" value={String(preview.counts.withheldRows)} tone="warn" />
                </View>
                <Text style={styles.sectionLabel}>Detected columns</Text>
                <View style={styles.detectedList}>
                  {detectedColumnList(preview).length > 0 ? (
                    detectedColumnList(preview).map((line) => (
                      <Text key={line} style={styles.detectedText} numberOfLines={1}>
                        {line}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.mutedText}>No known Virtual Landline columns detected.</Text>
                  )}
                </View>
                <Text style={styles.sectionLabel}>Preview</Text>
                {preview.previewRows.slice(0, 5).map((row) => (
                  <Text key={`${row.importKey}-${row.sourceRowNumber}`} style={styles.previewRow} numberOfLines={1}>
                    Row {row.sourceRowNumber}: {directionLabel(row.direction)} · {formatPhone(row.customerPhoneNormalized)} ·{' '}
                    {formatDateTime(row.startedAt)}
                  </Text>
                ))}
                {preview.invalidSamples.length > 0 ? (
                  <>
                    <Text style={styles.sectionLabel}>Skipped rows</Text>
                    {preview.invalidSamples.slice(0, 3).map((row) => (
                      <Text key={`invalid-${row.rowNumber}`} style={styles.previewRow} numberOfLines={1}>
                        Row {row.rowNumber}: {row.reason}
                      </Text>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}

            {importResult ? (
              <View style={styles.resultStrip}>
                <Text style={styles.resultText}>
                  Imported {importResult.imported} · skipped {importResult.skipped} · duplicate {importResult.duplicate} ·
                  invalid {importResult.invalid} · missed alerts {importResult.missedCalls}
                </Text>
              </View>
            ) : null}

          </View>

          <View style={styles.listHeader}>
            <View>
              <Text style={styles.cardTitle}>Call interactions</Text>
              <Text style={styles.cardSubtitle}>{summaryText}</Text>
            </View>
            <View style={styles.missedPill}>
              <AppIcon name="exclamation-circle" size={13} color={colors.warning} />
              <Text style={styles.missedPillText}>{pendingMissedCount} missed</Text>
            </View>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <AppIcon name="search" size={14} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search number, customer or booking ref"
                placeholderTextColor={colors.subtle}
                style={styles.searchInput}
                autoCapitalize="none"
              />
            </View>
            <AppButton label="Search" variant="secondary" onPress={() => void loadInteractions()} style={styles.searchButton} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((filter, index) => {
              const selected = index === filterIndex;
              return (
                <Pressable
                  key={filter.label}
                  onPress={() => setFilterIndex(index)}
                  style={[styles.filterPill, selected && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextActive]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {loadState === 'loading' ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mutedText}>Loading...</Text>
            </View>
          ) : null}

          {loadState !== 'loading' && items.length === 0 ? (
            <View style={styles.emptyBox}>
              <AppIcon name={search.trim() ? 'search' : 'phone'} size={24} color={colors.muted} />
              <Text style={styles.emptyTitle}>{search.trim() ? 'No search results' : 'No imports yet'}</Text>
              <Text style={styles.emptyText}>
                Select a Virtual Landline call-history CSV to preview the detected mapping before confirming import.
              </Text>
            </View>
          ) : null}

          {items.map((interaction) => (
            <InteractionCard
              key={interaction.id}
              interaction={interaction}
              busy={busyActionId === interaction.id}
              linkValue={linkInputs[interaction.id] || ''}
              onLinkValueChange={(value) => setLinkInputs((prev) => ({ ...prev, [interaction.id]: value }))}
              onCallBack={() => handleCallBack(interaction)}
              onCreateDraft={() => void handleCreateDraft(interaction)}
              onOpenCustomer={() => void handleCreateDraft(interaction)}
              onMarkReviewed={() => void handleMarkReviewed(interaction)}
              onLinkBooking={() => void handleLinkBooking(interaction)}
              onOpenRecording={() => handleOpenRecording(interaction)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'danger' | 'info' }) {
  const palette =
    tone === 'danger'
      ? { color: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder }
      : tone === 'warn'
        ? { color: colors.warning, bg: colors.warningBg, border: colors.warningBorder }
        : tone === 'info'
          ? { color: colors.info, bg: colors.infoBg, border: colors.infoBorder }
          : { color: colors.text, bg: colors.surfaceElevated, border: colors.border };
  return (
    <View style={[styles.metric, { borderColor: palette.border, backgroundColor: palette.bg }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: palette.color }]}>{value}</Text>
    </View>
  );
}

function InteractionCard({
  interaction,
  busy,
  linkValue,
  onLinkValueChange,
  onCallBack,
  onCreateDraft,
  onOpenCustomer,
  onMarkReviewed,
  onLinkBooking,
  onOpenRecording,
}: {
  interaction: VirtualLandlineInteraction;
  busy: boolean;
  linkValue: string;
  onLinkValueChange: (value: string) => void;
  onCallBack: () => void;
  onCreateDraft: () => void;
  onOpenCustomer: () => void;
  onMarkReviewed: () => void;
  onLinkBooking: () => void;
  onOpenRecording: () => void;
}) {
  const tone = directionTone(interaction.direction);
  const costLabel = formatCost(interaction.costRaw);
  return (
    <View style={styles.interactionCard}>
      <View style={styles.interactionTop}>
        <View style={[styles.directionBadge, { borderColor: tone.border, backgroundColor: tone.bg }]}>
          <Text style={[styles.directionText, { color: tone.color }]}>{directionLabel(interaction.direction)}</Text>
        </View>
        <View style={styles.stateBadge}>
          <Text style={styles.stateBadgeText}>{interactionStateLabel(interaction)}</Text>
        </View>
        <Text style={styles.dateText}>{formatDateTime(interaction.startedAt)}</Text>
      </View>
      <Text style={styles.phoneText}>{formatPhone(interaction.customerPhoneNormalized)}</Text>
      <Text style={styles.detailText}>
        Caller: {formatPhone(interaction.callerNumberRaw)} · Called: {formatPhone(interaction.destinationNumberRaw)}
      </Text>
      <Text style={styles.detailText}>
        {formatDuration(interaction.durationSeconds)} · {interaction.callStatus || 'unknown'}
        {costLabel ? ` · Cost ${costLabel}` : ''}
      </Text>
      {interaction.matchedCustomer ? (
        <Text style={styles.matchText} numberOfLines={1}>
          Customer: {interaction.matchedCustomer.name || interaction.matchedCustomer.email || 'Matched customer'}
        </Text>
      ) : null}
      {interaction.linkedBooking ? (
        <Text style={styles.matchText} numberOfLines={1}>
          Linked booking: {interaction.linkedBooking.refNumber || interaction.linkedBooking.id}
        </Text>
      ) : interaction.linkedQuickBooking ? (
        <Text style={styles.matchText} numberOfLines={1}>
          Linked draft: {interaction.linkedQuickBooking.customerName || interaction.linkedQuickBooking.id}
        </Text>
      ) : null}

      <View style={styles.actionGrid}>
        <AppButton label="Call Back" variant="secondary" onPress={onCallBack} disabled={!interaction.customerPhoneNormalized || busy} />
        <AppButton label="Create Draft" onPress={onCreateDraft} disabled={!interaction.customerPhoneNormalized || busy} loading={busy} />
        {interaction.matchedCustomer ? (
          <AppButton label="Open Customer" variant="secondary" onPress={onOpenCustomer} disabled={busy} />
        ) : null}
        <AppButton label="Reviewed" variant="secondary" onPress={onMarkReviewed} disabled={interaction.reviewed || busy} />
        {interaction.recordingUrl ? (
          <AppButton label="Recording" variant="secondary" onPress={onOpenRecording} disabled={busy} />
        ) : null}
      </View>

      <View style={styles.linkRow}>
        <TextInput
          value={linkValue}
          onChangeText={onLinkValueChange}
          placeholder="Booking ref to link"
          placeholderTextColor={colors.subtle}
          autoCapitalize="characters"
          style={styles.linkInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={busy ? undefined : onLinkBooking}
          style={({ pressed }) => [styles.linkButton, pressed && !busy && styles.linkButtonPressed, busy && styles.disabledButton]}
        >
          <AppIcon name="link" size={15} color={busy ? colors.subtle : colors.accent} />
          <Text style={[styles.linkButtonText, busy && { color: colors.subtle }]}>Link</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space.md,
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.sm,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glowBorder,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  closeButton: {
    minWidth: 88,
  },
  body: {
    paddingBottom: space.xl,
    gap: space.md,
  },
  importCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  importActions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  previewBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.sm,
    backgroundColor: colors.bg,
    gap: space.sm,
  },
  previewTitle: {
    color: colors.text,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  metric: {
    minWidth: 72,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.xs,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  sectionLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    marginTop: space.xs,
  },
  detectedList: {
    gap: 4,
  },
  detectedText: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  mutedText: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  previewRow: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  resultStrip: {
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  resultText: {
    color: colors.success,
    fontWeight: '800',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  missedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  missedPillText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    minHeight: 44,
  },
  searchButton: {
    minWidth: 92,
  },
  filters: {
    gap: space.xs,
    paddingVertical: 2,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  filterPillActive: {
    borderColor: colors.glowBorder,
    backgroundColor: colors.accentSoft,
  },
  filterText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  filterTextActive: {
    color: colors.accent,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  interactionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  interactionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  directionBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  directionText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  stateBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  stateBadgeText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  dateText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  phoneText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  detailText: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  matchText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  linkRow: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'center',
  },
  linkInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.bg,
    paddingHorizontal: space.sm,
    fontWeight: '800',
  },
  linkButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.accentSoft,
  },
  linkButtonPressed: {
    opacity: 0.82,
  },
  disabledButton: {
    opacity: 0.5,
  },
  linkButtonText: {
    color: colors.accent,
    fontWeight: '900',
  },
});
