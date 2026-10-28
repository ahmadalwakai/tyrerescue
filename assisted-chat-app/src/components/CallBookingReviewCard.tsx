import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { api, getApiContextRevision } from '@/lib/api';
import {
  extractCallBookingReview,
  getCallBookingDraftBlockedReason,
  MAX_CALL_TRANSCRIPT_LENGTH,
  type CallBookingReview,
} from '@/lib/call-booking-draft';
import { ASSISTED_CHAT_SERVICE_LABELS } from '@/lib/assisted-chat-workflow';
import type { AssistedChatDraft, AssistedChatServiceType } from '@/types/assisted-chat';
import { AppButton, FieldLabel, InlineNotice, SectionCard } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface CallBookingReviewCardProps {
  draft: AssistedChatDraft;
  onApply: (review: CallBookingReview) => string | null;
  activeProjectId?: string | null;
}

interface CapabilityReasons {
  transfer: string;
  transcript: string;
}

interface CapabilityState {
  scope: string;
  status: 'ready' | 'unavailable';
  reasons?: CapabilityReasons;
}

function readCapabilityReasons(value: unknown): CapabilityReasons | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (result.provider !== 'bonline' || result.manualTranscriptDraft !== true) return null;
  const transfer = result.transfer as Record<string, unknown> | undefined;
  const transcript = result.transcript as Record<string, unknown> | undefined;
  // An enabled response requires a future client with a verified call-control
  // adapter. An older client must never turn it into a dial or guessed request.
  if (!transfer || transfer.available !== false || !transcript || transcript.available !== false
    || typeof transfer.reason !== 'string' || typeof transcript.reason !== 'string'
    || !transfer.reason.trim() || !transcript.reason.trim()
    || transfer.reason.length > 300 || transcript.reason.length > 300) return null;
  return { transfer: transfer.reason, transcript: transcript.reason };
}

const SERVICE_OPTIONS: AssistedChatServiceType[] = ['assess', 'fit', 'repair', 'locking_nut'];

function ReviewField({ label, selected, value, onToggle, onChange, placeholder, maxLength, multiline, disabled }: {
  label: string;
  selected: boolean;
  value: string;
  onToggle: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
  disabled: boolean;
}) {
  return (
    <View style={styles.field}>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={`Use ${label.toLowerCase()} in draft`}
        accessibilityState={{ checked: selected, disabled }}
        style={styles.selection}
      >
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          <Text style={styles.checkmark}>{selected ? '✓' : ''}</Text>
        </View>
        <Text style={styles.fieldLabel}>Use {label.toLowerCase()}</Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Reviewed ${label.toLowerCase()}`}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        multiline={multiline}
        editable={!disabled}
        autoCorrect={false}
        maxLength={maxLength}
        style={[styles.input, multiline && styles.reviewMultiline]}
      />
    </View>
  );
}

/** Raw call text remains in this mounted editor until it is cleared. Only the
 * fields the operator reviews and selects are passed to the local draft. */
export function CallBookingReviewCard({ draft, onApply, activeProjectId }: CallBookingReviewCardProps) {
  const [transcript, setTranscript] = useState('');
  const [review, setReview] = useState<CallBookingReview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: 'info' | 'err'; text: string } | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityState | null>(null);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const authenticated = api.hasAdminToken;
  const supportedProject = !activeProjectId || activeProjectId === 'tyrerescue';
  const capabilityScope = `${activeProjectId ?? 'tyrerescue'}:${apiRevision}:${sessionRevision}`;
  const blockedReason = getCallBookingDraftBlockedReason(draft);
  const disabled = Boolean(blockedReason);

  useEffect(() => {
    if (!supportedProject || !authenticated) return undefined;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && api.hasAdminToken
      && apiRevision === getApiContextRevision() && sessionRevision === getAdminSessionRevision();
    void api.get<unknown>('/api/mobile/admin/phone/capabilities', {
      signal: controller.signal,
      timeoutMs: 8_000,
    }).then((response) => {
      if (!isCurrent()) return;
      const reasons = readCapabilityReasons(response);
      setCapabilities(reasons
        ? { scope: capabilityScope, status: 'ready', reasons }
        : { scope: capabilityScope, status: 'unavailable' });
    }).catch(() => {
      if (isCurrent()) setCapabilities({ scope: capabilityScope, status: 'unavailable' });
    });
    return () => controller.abort();
  }, [apiRevision, authenticated, capabilityScope, sessionRevision, supportedProject]);

  const currentCapabilities = capabilities?.scope === capabilityScope ? capabilities : null;
  const transferReason = !supportedProject
    ? 'Call transfer is not connected for this workspace.'
    : !authenticated
    ? 'Sign in to check call services.'
    : currentCapabilities?.reasons?.transfer ?? 'Call transfer is not enabled in this app yet.';
  const transcriptReason = !supportedProject
    ? 'Automatic call transcripts are not connected for this workspace.'
    : currentCapabilities?.reasons?.transcript ?? 'Automatic call transcripts are not connected yet.';

  const clearEditor = () => {
    setTranscript('');
    setReview(null);
    setWarnings([]);
    setNotice(null);
  };
  const changeTranscript = (value: string) => {
    setTranscript(value);
    setReview(null);
    setWarnings([]);
    setNotice(null);
  };
  const changeReview = (patch: Partial<CallBookingReview>) => {
    setReview((previous) => previous ? { ...previous, ...patch } : previous);
    setNotice(null);
  };
  const extract = () => {
    if (disabled || !transcript.trim()) return;
    try {
      const result = extractCallBookingReview(transcript);
      setReview(result.review);
      setWarnings(result.warnings);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : 'Could not read these notes. Please edit them and try again.' });
    }
  };
  const apply = () => {
    if (!review || disabled) return;
    try {
      const error = onApply(review);
      if (error) {
        setNotice({ kind: 'err', text: error });
        return;
      }
      clearEditor();
      setNotice({ kind: 'info', text: 'Reviewed details added to the draft. Continue the booking steps to check the location, price and save.' });
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : 'Could not apply these details. Please review them again.' });
    }
  };
  const hasSelectedDetails = review && (
    (review.useLocation && review.locationAddress.trim())
    || (review.useTyreSize && review.tyreSize.trim())
    || (review.useProblem && review.problem.trim())
  );

  return (
    <SectionCard title="Call assistance" helperText="Turn call notes into a draft you can check before creating a booking.">
      <View style={styles.transfer}>
        <AppButton
          label="Transfer to booking owner"
          variant="secondary"
          disabled
          accessibilityHint={transferReason}
          testID="call-transfer-unavailable"
        />
        <Text style={styles.helper}>{transferReason}</Text>
        {supportedProject && authenticated && !currentCapabilities ? (
          <Text style={styles.helper} accessibilityLiveRegion="polite">Checking call services…</Text>
        ) : null}
        {supportedProject && authenticated && currentCapabilities?.status === 'unavailable' ? (
          <Text style={styles.helper}>Call service status could not be checked. You can still use notes below.</Text>
        ) : null}
      </View>

      <View style={styles.editor}>
        <Text style={styles.helper}>{transcriptReason} Paste the transcript or your own notes below.</Text>
        {blockedReason ? <InlineNotice kind="warn">{blockedReason}</InlineNotice> : null}
        <FieldLabel>Call transcript or notes</FieldLabel>
        <TextInput
          testID="call-transcript-input"
          accessibilityLabel="Call transcript or notes"
          value={transcript}
          onChangeText={changeTranscript}
          placeholder="Customer: I'm at 12 High Street, Glasgow G1 1AA. The tyre is 205/55 R16 and has a puncture."
          placeholderTextColor={colors.subtle}
          multiline
          editable={!disabled}
          maxLength={MAX_CALL_TRANSCRIPT_LENGTH}
          autoCorrect={false}
          style={[styles.input, styles.transcript]}
        />
        <Text style={styles.counter}>{transcript.length.toLocaleString()} / {MAX_CALL_TRANSCRIPT_LENGTH.toLocaleString()} characters</Text>
        <View style={styles.actions}>
          <AppButton label="Review extracted details" onPress={extract} disabled={disabled || !transcript.trim()} testID="call-review-extract" />
          <AppButton label="Clear notes" variant="ghost" onPress={clearEditor} disabled={!transcript && !review} />
        </View>
      </View>

      {review ? (
        <View style={styles.review} testID="call-draft-review">
          <Text style={styles.reviewTitle} accessibilityRole="header">Review before applying</Text>
          <Text style={styles.helper}>Check each suggestion against the call. Edit it or untick it to keep the current draft value.</Text>
          {warnings.length > 0 ? <InlineNotice kind="warn">{warnings.join('\n')}</InlineNotice> : null}
          <ReviewField
            label="Location"
            selected={review.useLocation}
            value={review.locationAddress}
            onToggle={() => changeReview({ useLocation: !review.useLocation })}
            onChange={(locationAddress) => changeReview({ locationAddress })}
            placeholder="Enter or confirm the customer's location"
            maxLength={500}
            multiline
            disabled={disabled}
          />
          {review.useLocation && draft.location.address.trim() ? (
            <Text style={styles.helper}>Current location: {draft.location.address}. Applying the selected location replaces it.</Text>
          ) : null}
          <Text style={styles.helper}>Select the address from suggestions in the location step to confirm its map position.</Text>
          <ReviewField
            label="Tyre size"
            selected={review.useTyreSize}
            value={review.tyreSize}
            onToggle={() => changeReview({ useTyreSize: !review.useTyreSize })}
            onChange={(tyreSize) => changeReview({ tyreSize })}
            placeholder="For example, 205/55 R16"
            maxLength={32}
            disabled={disabled}
          />
          {review.useTyreSize && draft.tyreLines[0]?.size.trim() ? (
            <Text style={styles.helper}>Current first tyre: {draft.tyreLines[0].size}. Applying this size replaces that tyre selection.</Text>
          ) : null}
          <ReviewField
            label="Problem"
            selected={review.useProblem}
            value={review.problem}
            onToggle={() => changeReview({ useProblem: !review.useProblem })}
            onChange={(problem) => changeReview({ problem })}
            placeholder="Describe the problem reported by the customer"
            maxLength={1200}
            multiline
            disabled={disabled}
          />
          <Text style={styles.helper}>The selected problem is added to the existing booking notes.</Text>
          <FieldLabel>Confirm the service</FieldLabel>
          <View style={styles.serviceOptions}>
            {SERVICE_OPTIONS.map((serviceType) => (
              <Pressable
                key={serviceType}
                accessibilityRole="radio"
                accessibilityLabel={ASSISTED_CHAT_SERVICE_LABELS[serviceType]}
                accessibilityState={{ selected: review.serviceType === serviceType, disabled }}
                disabled={disabled}
                onPress={() => changeReview({ serviceType })}
                style={[styles.serviceOption, review.serviceType === serviceType && styles.serviceSelected]}
              >
                <Text style={[styles.serviceLabel, review.serviceType === serviceType && styles.serviceLabelSelected]}>
                  {ASSISTED_CHAT_SERVICE_LABELS[serviceType]}
                </Text>
              </Pressable>
            ))}
          </View>
          {review.serviceType === 'locking_nut' ? (
            <Text style={styles.helper}>This service includes locking wheel nut removal only. Any tyre size is kept for review, with no tyre work included.</Text>
          ) : review.serviceType === 'assess' ? (
            <Text style={styles.helper}>Inspection is selected. Any tyre size is kept for review; final tyre work and cost still need confirmation.</Text>
          ) : null}
          <Text style={styles.helper}>Only checked details are applied. No booking is created by this step.</Text>
          <AppButton
            label="Apply to draft"
            accessibilityLabel="Apply reviewed details to draft"
            onPress={apply}
            disabled={disabled || !hasSelectedDetails}
            testID="call-review-apply"
          />
        </View>
      ) : null}
      {notice ? <View accessibilityLiveRegion="polite"><InlineNotice kind={notice.kind}>{notice.text}</InlineNotice></View> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  transfer: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  editor: { gap: space.sm, paddingTop: space.md },
  helper: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  counter: { color: colors.subtle, fontSize: fontSize.xs, textAlign: 'right' },
  input: {
    backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.sm, padding: space.md,
    minHeight: 48, fontSize: fontSize.sm, lineHeight: 21,
  },
  transcript: { minHeight: 128, textAlignVertical: 'top' },
  reviewMultiline: { minHeight: 76, textAlignVertical: 'top' },
  actions: { gap: space.xs },
  review: { gap: space.sm, marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  reviewTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  field: { gap: space.xxs },
  selection: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.accentText, fontSize: fontSize.md, fontWeight: '800' },
  fieldLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  serviceOptions: { gap: space.xs },
  serviceOption: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.sm, justifyContent: 'center' },
  serviceSelected: { borderColor: colors.glowBorder, backgroundColor: colors.accentMuted },
  serviceLabel: { color: colors.muted, fontSize: fontSize.sm },
  serviceLabelSelected: { color: colors.accent, fontWeight: '700' },
});
