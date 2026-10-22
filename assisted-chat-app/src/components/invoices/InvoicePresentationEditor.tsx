import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, ApiError, getAdminToken, getApiBaseUrl } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { formatGbp } from '@/lib/money';
import {
  invoicePresentationDraft, parseInvoicePresentationSnapshot, validateInvoicePresentationDraft,
  type InvoicePresentationDraft, type InvoicePresentationSnapshot,
} from '@/types/invoice-presentation';
import { AppButton, FieldLabel, StatusBanner } from '../ui';
import { colors, fontSize, radius, space } from '../theme';

interface Props { bookingRef: string; onClose: () => void }
export interface InvoicePresentationEditorHandle { requestClose: () => void }

export const InvoicePresentationEditor = forwardRef<InvoicePresentationEditorHandle, Props>(function InvoicePresentationEditor({ bookingRef, onClose }, ref) {
  const token = getAdminToken(); const baseUrl = getApiBaseUrl(); const revision = getAdminSessionRevision();
  const context = useMemo(() => ({ bookingRef, token, baseUrl, revision }), [bookingRef, token, baseUrl, revision]);
  const activeContext = useRef(context); activeContext.current = context;
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const [form, setForm] = useState<{ context: typeof context; snapshot: InvoicePresentationSnapshot; draft: InvoicePresentationDraft } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ context: typeof context; kind: 'ok' | 'err'; text: string } | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const current = useCallback(() => mounted.current && activeContext.current === context && Boolean(context.token)
    && getAdminToken() === context.token && getApiBaseUrl() === context.baseUrl && getAdminSessionRevision() === context.revision, [context]);
  const endpoint = `/api/mobile/admin/bookings/${encodeURIComponent(bookingRef)}/invoice`;

  const reload = useCallback(async () => {
    if (!current() || savingRef.current) return;
    const controller = new AbortController(); requests.current.add(controller);
    setLoading(true);
    try {
      const snapshot = parseInvoicePresentationSnapshot(await api.get<unknown>(endpoint, { signal: controller.signal }));
      if (current() && !controller.signal.aborted) { setForm({ context, snapshot, draft: invoicePresentationDraft(snapshot.invoicePresentation) }); setNotice(null); setMustReload(false); }
    } catch (cause) {
      if (current() && !controller.signal.aborted) setNotice({ context, kind: 'err', text: cause instanceof Error ? cause.message : 'Could not load invoice options. Please retry.' });
    } finally {
      requests.current.delete(controller);
      if (current()) setLoading(false);
    }
  }, [context, current, endpoint]);

  useEffect(() => {
    mounted.current = true; savingRef.current = false; setSaving(false);
    const activeRequests = requests.current;
    void reload();
    return () => { mounted.current = false; activeRequests.forEach((request) => request.abort()); activeRequests.clear(); };
  }, [reload]);

  const visibleForm = form?.context === context ? form : null;
  const validation = visibleForm ? validateInvoicePresentationDraft(visibleForm.draft, visibleForm.snapshot.totalPence) : null;
  const dirty = Boolean(visibleForm && JSON.stringify(visibleForm.draft) !== JSON.stringify(invoicePresentationDraft(visibleForm.snapshot.invoicePresentation)));
  const confirmDiscard = useCallback((action: () => void) => {
    if (!current() || savingRef.current) return;
    if (!dirty) { action(); return; }
    Alert.alert('Discard invoice changes?', 'Your unsaved invoice options will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: () => { if (current() && !savingRef.current) action(); } },
    ]);
  }, [current, dirty]);
  const requestClose = useCallback(() => confirmDiscard(onClose), [confirmDiscard, onClose]);
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);
  const change = (patch: Partial<InvoicePresentationDraft>) => {
    if (savingRef.current) return;
    setForm((previous) => previous?.context === context ? { ...previous, draft: { ...previous.draft, ...patch } } : previous);
    setNotice(null);
  };
  const changeLine = (index: number, key: 'label' | 'amount', value: string) => {
    if (!visibleForm) return;
    change({ lines: visibleForm.draft.lines.map((line, position) => position === index ? { ...line, [key]: value } : line) });
  };

  const save = async () => {
    if (!current() || savingRef.current || !visibleForm || loading || mustReload) return;
    const checked = validateInvoicePresentationDraft(visibleForm.draft, visibleForm.snapshot.totalPence);
    if (!checked.presentation) { setNotice({ context, kind: 'err', text: checked.error ?? 'Check the invoice options.' }); return; }
    savingRef.current = true; setSaving(true); setNotice(null);
    const controller = new AbortController(); requests.current.add(controller);
    let saved = false;
    try {
      await api.patch(endpoint, { invoicePresentation: checked.presentation, expectedUpdatedAt: visibleForm.snapshot.bookingUpdatedAt }, { signal: controller.signal });
      saved = true;
      if (!current() || controller.signal.aborted) return;
      const snapshot = parseInvoicePresentationSnapshot(await api.get<unknown>(endpoint, { signal: controller.signal }));
      if (!current() || controller.signal.aborted) return;
      setForm({ context, snapshot, draft: invoicePresentationDraft(snapshot.invoicePresentation) }); setMustReload(false);
      setNotice({ context, kind: 'ok', text: 'Invoice options saved. The booking total and payment status are unchanged.' });
    } catch (cause) {
      if (current() && !controller.signal.aborted) {
        const conflict = cause instanceof ApiError && cause.status === 409;
        if (conflict || saved) setMustReload(true);
        setNotice({ context, kind: 'err', text: saved ? 'Invoice options were saved, but the latest details could not be loaded. Reload to check them.'
          : conflict ? 'This booking changed while you were editing. Reload its latest total and review the invoice options before saving.'
            : cause instanceof Error ? cause.message : 'Could not save invoice options. Please retry.' });
      }
    } finally {
      requests.current.delete(controller);
      if (current()) { savingRef.current = false; setSaving(false); }
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Customer invoice options</Text>
      <Text style={styles.copy}>Booking {bookingRef}. The invoice shows the final total by default. You can add information and your own price breakdown for the customer.</Text>
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {notice?.context === context ? <StatusBanner kind={notice.kind} message={notice.text} /> : null}
      {visibleForm ? <>
        <View style={styles.card}>
          <Text style={styles.label}>Booking total</Text>
          <Text style={styles.total}>{formatGbp(visibleForm.snapshot.totalPence / 100)}</Text>
          <Text style={styles.hint}>These options change invoice details only. Payments and the booking price stay the same.</Text>
        </View>
        {visibleForm.snapshot.priceBreakdownStale ? <StatusBanner kind="warn" message="The booking total changed. The old breakdown is hidden on the invoice until it matches the new total. Correct the amounts or reset to final total only." /> : null}
        <FieldLabel>Extra information for the customer (optional)</FieldLabel>
        <TextInput
          accessibilityLabel="Extra information for the customer" multiline maxLength={1500} editable={!saving && !loading && !mustReload}
          value={visibleForm.draft.extraInformation} onChangeText={(value) => change({ extraInformation: value })}
          placeholder="Details you want the customer to see on the invoice" placeholderTextColor={colors.subtle}
          style={[styles.input, styles.notes]} textAlignVertical="top"
        />
        <Text style={styles.hint}>{visibleForm.draft.extraInformation.length}/1500 characters</Text>
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>Show price breakdown on invoice</Text>
          <Switch accessibilityLabel="Show price breakdown on invoice" value={visibleForm.draft.showBreakdown} disabled={saving || loading || mustReload} onValueChange={(value) => change({ showBreakdown: value })} />
        </View>
        {visibleForm.draft.showBreakdown ? <>
          <Text style={styles.hint}>Enter up to 12 labels and amounts. They must add up exactly to the booking total. Only these lines will appear in the invoice breakdown.</Text>
          {visibleForm.draft.lines.map((line, index) => <View key={index} style={styles.card}>
            <FieldLabel>Line {index + 1} — description</FieldLabel>
            <TextInput accessibilityLabel={`Invoice line ${index + 1} description`} value={line.label} maxLength={160} editable={!saving && !loading && !mustReload}
              onChangeText={(value) => changeLine(index, 'label', value)} placeholder="e.g. Tyre fitting service" placeholderTextColor={colors.subtle} style={styles.input} />
            <FieldLabel>Amount (£)</FieldLabel>
            <TextInput accessibilityLabel={`Invoice line ${index + 1} amount in pounds`} value={line.amount} keyboardType="decimal-pad" editable={!saving && !loading && !mustReload}
              onChangeText={(value) => changeLine(index, 'amount', value)} placeholder="0.00" placeholderTextColor={colors.subtle} style={styles.input} />
            <AppButton label={`Remove line ${index + 1}`} variant="ghost" disabled={saving || loading || mustReload || visibleForm.draft.lines.length === 1}
              onPress={() => change({ lines: visibleForm.draft.lines.filter((_, position) => position !== index) })} />
          </View>)}
          <AppButton label="Add breakdown line" variant="secondary" disabled={saving || loading || mustReload || visibleForm.draft.lines.length >= 12}
            onPress={() => change({ lines: [...visibleForm.draft.lines, { label: '', amount: '' }] })} fullWidth />
          {validation?.breakdownPence != null ? <Text style={styles.copy}>Breakdown total: {formatGbp(validation.breakdownPence / 100)} / {formatGbp(visibleForm.snapshot.totalPence / 100)}</Text> : null}
          {validation?.error ? <StatusBanner kind="warn" message={validation.error} /> : null}
        </> : <Text style={styles.hint}>The invoice will show the final total without a price breakdown.</Text>}
        {visibleForm.draft.showBreakdown || visibleForm.snapshot.priceBreakdownStale ? <AppButton label="Reset to final total only" variant="secondary" disabled={saving || loading || mustReload}
          onPress={() => change({ showBreakdown: false, lines: [{ label: '', amount: '' }] })} fullWidth /> : null}
        <AppButton label="Save invoice options" variant="primary" loading={saving} disabled={saving || loading || mustReload || !validation?.presentation} onPress={() => { void save(); }} fullWidth />
      </> : null}
      <AppButton label={mustReload ? 'Reload latest booking' : 'Reload invoice options'} variant="secondary" disabled={saving || loading} onPress={() => confirmDiscard(() => { void reload(); })} fullWidth />
      <AppButton label="Back" variant="ghost" disabled={saving} onPress={requestClose} fullWidth />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1 }, content: { padding: space.md, paddingBottom: 40, gap: space.sm },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  copy: { color: colors.text, fontSize: fontSize.sm, lineHeight: 21 },
  hint: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 18 },
  label: { color: colors.muted, fontSize: fontSize.sm }, total: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '800' },
  card: { padding: space.md, gap: space.sm, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.card },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.inputBg, color: colors.text, padding: space.sm, fontSize: fontSize.md },
  notes: { minHeight: 112 }, toggle: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm },
  toggleLabel: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
