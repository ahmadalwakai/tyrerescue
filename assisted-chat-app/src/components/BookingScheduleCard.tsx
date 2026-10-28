import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import { useNow } from '@/hooks/useNow';
import { useBookingSlots } from '@/hooks/useBookingSlots';
import { formatBookingSchedule, getBookingScheduleError, getLondonDateString, londonSlotToIso } from '@/lib/booking-schedule';
import { AppButton, InlineNotice, SectionCard } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  draft: AssistedChatDraft;
  busy: boolean;
  projectId?: string | null;
  onChange: (bookingType: 'emergency' | 'scheduled', scheduledAt: string | null) => string | null;
}

const dayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });

export function BookingScheduleCard({ draft, busy, projectId, onChange }: Props) {
  const now = useNow(60_000, true);
  const today = getLondonDateString(new Date(now));
  const scheduled = draft.bookingType === 'scheduled';
  const savedDate = draft.scheduledAt && Number.isFinite(Date.parse(draft.scheduledAt))
    ? getLondonDateString(new Date(draft.scheduledAt)) : null;
  const [browsedDate, setBrowsedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedDate = browsedDate && browsedDate >= today ? browsedDate : savedDate && savedDate >= today ? savedDate : today;
  const saved = Boolean(draft.bookingTimingNeedsReview || draft.dispatchedBookingId || draft.dispatchedRefNumber || draft.paymentLink);
  const disabled = busy || saved;
  const slots = useBookingSlots(selectedDate, scheduled && !saved, projectId);
  const scheduleError = !saved && scheduled ? getBookingScheduleError(draft) : null;
  const days = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(`${today}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return { value: date.toISOString().slice(0, 10), label: index === 0 ? 'Today' : dayLabel.format(date) };
  });
  const change = (type: 'emergency' | 'scheduled', at: string | null) => {
    if (disabled) return false;
    const reason = onChange(type, at);
    setError(reason);
    return !reason;
  };

  if (draft.bookingTimingNeedsReview) {
    return <SectionCard title="Booking time"><InlineNotice kind="warn">Review the saved appointment in Bookings before continuing.</InlineNotice></SectionCard>;
  }

  return (
    <SectionCard title="When does the customer need us?" helperText={saved ? 'The booking time is saved. Manage this booking from Bookings.' : 'Choose an emergency call-out or book an available appointment.'}>
      <View style={styles.options}>
        {(['emergency', 'scheduled'] as const).map((type) => (
          <Pressable
            key={type}
            accessibilityRole="radio"
            accessibilityLabel={type === 'emergency' ? 'Emergency, as soon as possible' : 'Scheduled appointment'}
            accessibilityState={{ selected: scheduled === (type === 'scheduled'), disabled }}
            disabled={disabled}
            onPress={() => {
              if (draft.bookingType !== type && change(type, null)) setBrowsedDate(null);
            }}
            testID={`booking-type-${type}`}
            style={[styles.option, scheduled === (type === 'scheduled') && styles.selected, disabled && styles.disabled]}
          >
            <Text style={styles.title}>{type === 'emergency' ? 'Emergency' : 'Scheduled'}</Text>
            <Text style={styles.helper}>{type === 'emergency' ? 'As soon as possible' : 'Choose a day and time'}</Text>
          </Pressable>
        ))}
      </View>
      {scheduled ? (
        <View style={styles.schedule}>
          <Text style={styles.summary} testID="booking-schedule-summary">{formatBookingSchedule(draft)}</Text>
          <Text style={styles.helper}>All appointments use UK time (Europe/London).</Text>
          {!saved ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.days} accessibilityLabel="Appointment dates">
                {days.map((day) => (
                  <Pressable
                    key={day.value}
                    accessibilityRole="radio"
                    accessibilityLabel={dayLabel.format(new Date(`${day.value}T12:00:00.000Z`))}
                    accessibilityState={{ selected: selectedDate === day.value, disabled: busy }}
                    disabled={busy}
                    onPress={() => {
                      if (day.value !== selectedDate && change('scheduled', null)) setBrowsedDate(day.value);
                    }}
                    testID={`booking-date-${day.value}`}
                    style={[styles.day, selectedDate === day.value && styles.selected]}
                  ><Text style={styles.dayText}>{day.label}</Text></Pressable>
                ))}
              </ScrollView>
              {slots.loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.helper}>Loading available times…</Text></View> : null}
              {slots.error ? <InlineNotice kind="warn">{slots.error}</InlineNotice> : null}
              {!slots.loading && !slots.error && slots.slots.length === 0 ? <InlineNotice kind="info">No available times on this day. Choose another date.</InlineNotice> : null}
              <View style={styles.times}>
                {slots.slots.map((slot) => {
                  const at = londonSlotToIso(slot.date, slot.timeStart);
                  const expired = !at || Date.parse(at) <= now;
                  const selected = Boolean(at && draft.scheduledAt && Date.parse(at) === Date.parse(draft.scheduledAt));
                  return (
                    <Pressable
                      key={slot.slotId}
                      accessibilityRole="radio"
                      accessibilityLabel={`Appointment ${slot.label}, UK time`}
                      accessibilityState={{ selected, disabled: busy || expired }}
                      disabled={busy || expired}
                      onPress={() => { if (at && !expired) change('scheduled', at); }}
                      testID={`booking-slot-${slot.slotId}`}
                      style={[styles.time, selected && styles.selected, expired && styles.disabled]}
                    ><Text style={styles.dayText}>{slot.label}</Text></Pressable>
                  );
                })}
              </View>
              <AppButton label="Refresh available times" variant="ghost" onPress={slots.refresh} disabled={busy || slots.loading} />
              <Text style={styles.helper}>The appointment is reserved when the booking is created. Availability is checked again then.</Text>
              {draft.quote || draft.savedQuoteId ? <Text style={styles.helper}>Changing the appointment requires a new price and quote confirmation.</Text> : null}
              {scheduleError ? <InlineNotice kind="warn">{scheduleError}</InlineNotice> : null}
            </>
          ) : null}
        </View>
      ) : null}
      {error ? <InlineNotice kind="err">{error}</InlineNotice> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', gap: space.sm },
  option: { flex: 1, minHeight: 74, padding: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: 'center', gap: 4 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  disabled: { opacity: 0.55 },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  helper: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  summary: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  schedule: { gap: space.sm, marginTop: space.md },
  days: { gap: space.xs, paddingBottom: space.xs },
  day: { minHeight: 44, paddingHorizontal: space.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  dayText: { color: colors.text, fontSize: fontSize.sm },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  time: { minHeight: 44, paddingHorizontal: space.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
