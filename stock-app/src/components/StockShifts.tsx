import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';
import type { StockCity, StockShift, StockWorker } from '@/types';
import { Button, EmptyState, Message } from './StockPrimitives';

export interface StockShiftsProps {
  city: StockCity | null;
  activeShift: StockShift | null;
  workers: StockWorker[];
  selectedWorkerId: string | null;
  sharedWorkerMode: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSelectWorker: (id: string) => void;
  onStart: () => void;
  onEnd: () => void;
  onStartWorker: (worker: StockWorker) => void;
  onEndWorker: (worker: StockWorker) => void;
  onRetry: () => void;
}

function isActive(shift: StockShift | null | undefined) {
  return Boolean(shift && shift.status === 'active' && !shift.endedAt);
}

function startedLabel(value: string | null | undefined) {
  if (!value) return 'Start time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Start time unavailable' : `Started ${date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

export function StockShifts({ city, activeShift, workers, selectedWorkerId, sharedWorkerMode, loading, saving, error, onSelectWorker, onStart, onEnd, onStartWorker, onEndWorker, onRetry }: StockShiftsProps) {
  const [workersOpen, setWorkersOpen] = useState(false);
  const [confirmingShiftId, setConfirmingShiftId] = useState<string | null>(null);
  const selectedWorker = workers.find((worker) => worker.userId === selectedWorkerId) ?? null;
  const shift = sharedWorkerMode ? selectedWorker?.activeShift ?? null : activeShift;
  const active = isActive(shift);
  const shiftName = sharedWorkerMode ? selectedWorker?.name ?? 'Choose a worker' : 'Your shift';
  const disabled = saving || loading || !city || Boolean(error);
  const confirmEnd = active && shift?.id === confirmingShiftId;

  function start() {
    setConfirmingShiftId(null);
    if (sharedWorkerMode) {
      if (selectedWorker) onStartWorker(selectedWorker);
    } else onStart();
  }

  function end() {
    setConfirmingShiftId(null);
    if (sharedWorkerMode) {
      if (selectedWorker) onEndWorker(selectedWorker);
    } else onEnd();
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}><Text style={styles.heading}>Shifts</Text>{loading ? <ActivityIndicator color={colors.primary} /> : null}</View>
      <Text style={styles.description}>{sharedWorkerMode ? 'Choose the worker using this device. Stock movements are assigned to their shift.' : 'Start a shift before recording sales. Your sales remain linked to this city and shift.'}</Text>
      {error ? <View style={styles.error}><Message text={error} tone="error" /><Button title="Retry shifts" onPress={onRetry} icon="refresh" disabled={loading} /></View> : null}
      {!city ? <EmptyState title="Choose a city first" description="Select a stock city to see available shifts." /> : (
        <View style={styles.card}>
          <View style={styles.summary}>
            <View style={styles.avatar}><MaterialCommunityIcons name={sharedWorkerMode ? 'account-outline' : 'clock-outline'} size={24} color={colors.primary} /></View>
            <View style={styles.summaryText}><Text style={styles.name}>{shiftName}</Text><Text style={styles.city}>{city.name}</Text></View>
            <View style={[styles.status, active && styles.statusActive]}><View style={[styles.dot, active && { backgroundColor: colors.success }]} /><Text style={[styles.statusText, active && { color: colors.success }]}>{active ? 'Active' : 'Off shift'}</Text></View>
          </View>
          {active ? <Text style={styles.description}>{startedLabel(shift?.startedAt)}</Text> : null}
          {sharedWorkerMode ? (
            <>
              <Button title={workersOpen ? 'Close worker list' : selectedWorker ? 'Change worker' : 'Choose worker'} icon="account-switch-outline" onPress={() => setWorkersOpen((open) => !open)} disabled={saving || loading} />
              {workersOpen ? (
                <ScrollView style={styles.workerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {workers.length === 0 ? <EmptyState title="No workers available" description="No stock workers were returned for this city." onRetry={onRetry} retryLabel="Refresh workers" /> : workers.map((worker) => {
                    const selected = worker.userId === selectedWorkerId;
                    const working = isActive(worker.activeShift);
                    return (
                      <Pressable key={worker.userId} accessibilityRole="button" accessibilityLabel={`${worker.name}, ${working ? 'active shift' : 'off shift'}`} accessibilityState={{ selected, disabled: saving || loading }} disabled={saving || loading} onPress={() => { setConfirmingShiftId(null); onSelectWorker(worker.userId); setWorkersOpen(false); }} style={({ pressed }) => [styles.workerRow, selected && styles.workerSelected, pressed && { opacity: 0.78 }]}>
                        <View style={styles.workerText}><Text style={styles.workerName}>{worker.name}</Text><Text style={styles.workerState}>{working ? 'Active shift' : 'Off shift'}</Text></View>
                        <MaterialCommunityIcons name={selected ? 'check-circle' : 'circle-outline'} size={22} color={selected ? colors.primary : colors.muted} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
            </>
          ) : null}
          {confirmEnd ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>End {sharedWorkerMode ? `${selectedWorker?.name ?? 'this worker'}’s` : 'your'} shift?</Text>
              <Text style={styles.description}>Finish any stock entry before ending the shift.</Text>
              <View style={styles.confirmButtons}><View style={styles.confirmButton}><Button title="Keep working" onPress={() => setConfirmingShiftId(null)} disabled={saving} /></View><View style={styles.confirmButton}><Button title="End shift" tone="danger" icon="stop-circle-outline" onPress={end} disabled={disabled} /></View></View>
            </View>
          ) : active ? <Button title={saving ? 'Saving…' : 'End shift'} icon="stop-circle-outline" onPress={() => setConfirmingShiftId(shift?.id ?? null)} disabled={disabled} /> : <Button title={saving ? 'Starting shift…' : 'Start shift'} icon="play-circle-outline" tone="primary" onPress={start} disabled={disabled || sharedWorkerMode && !selectedWorker} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { gap: 8 },
  card: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 16 },
  summary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, minWidth: 100, gap: 5 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  city: { color: colors.muted, fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.panelSoft },
  statusActive: { backgroundColor: colors.successSoft },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  workerList: { maxHeight: 280, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  workerRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  workerSelected: { backgroundColor: colors.primarySoft },
  workerText: { flex: 1, gap: 5 },
  workerName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  workerState: { color: colors.muted, fontSize: 12 },
  confirm: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12, gap: 12 },
  confirmTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  confirmButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmButton: { flex: 1, minWidth: 120 },
});
