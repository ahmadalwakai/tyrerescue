import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { customerInvoiceUrl, requestJson } from './api';
import { PHONE_TEL } from './config';
import { loadBookingAccess } from './customer-booking-access';
import { colors, spacing, typography } from './theme';
import { AppHeader, Card, InlineNotice, LoadingState, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from './ui';

export interface CustomerServiceFeedback {
  rating: number;
  comment: string;
  updatedAt: string;
}

export interface CustomerServiceReportData {
  bookingId: string;
  refNumber: string;
  status: 'completed';
  serviceType: string;
  completedAt: string | null;
  vehicle: { registration: string | null; make: string | null; model: string | null };
  tyres: { description: string; quantity: number }[];
  photos: { id: string; url: string }[];
  invoiceDownloadToken: string | null;
  feedback: CustomerServiceFeedback | null;
}

const humanService = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const ratingLabels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Remounted by the route whenever the booking or signed-in account changes. */
export function CustomerServiceReport({ refNumber, token }: { refNumber: string; token: string | null }) {
  const insets = useScreenContentInsets();
  const [report, setReport] = useState<CustomerServiceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(false);
  const requestVersion = useRef(0);
  const working = useRef(false);
  const access = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const path = `/api/mobile/customer/bookings/${encodeURIComponent(refNumber)}/service-report`;

  const load = useCallback(async () => {
    if (!alive.current) return;
    const version = ++requestVersion.current;
    const current = () => alive.current && version === requestVersion.current;
    setLoading(true); setError('');
    try {
      if (!refNumber) throw new Error('Open the service report from your completed booking.');
      const proof = await loadBookingAccess(refNumber);
      if (!current()) return;
      access.current = proof;
      const data = await requestJson<CustomerServiceReportData>(path, {
        signal: controller.current?.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(proof ? { 'X-Booking-Access': proof } : {}) },
      });
      if (!current()) return;
      if (data.status !== 'completed' || data.refNumber !== refNumber) throw new Error('This service report is not available for this booking.');
      setReport(data); setRating(data.feedback?.rating ?? 0); setComment(data.feedback?.comment ?? '');
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : 'Unable to load your service report. Please try again.');
    } finally { if (current()) setLoading(false); }
  }, [path, refNumber, token]);

  useEffect(() => {
    alive.current = true;
    controller.current = new AbortController();
    void load();
    return () => { alive.current = false; requestVersion.current += 1; controller.current?.abort(); };
  }, [load]);

  async function saveFeedback() {
    if (!alive.current || working.current || !report || rating < 1 || rating > 5) return;
    working.current = true;
    setSaving(true); setSaveError(''); setMessage('');
    try {
      const response = await requestJson<{ success: boolean; feedback: CustomerServiceFeedback }>(path, {
        method: 'POST', signal: controller.current?.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(access.current ? { 'X-Booking-Access': access.current } : {}) },
        body: JSON.stringify({ rating, comment: comment.trim() }),
      });
      if (!alive.current) return;
      if (!response.success) throw new Error('Unable to save your feedback. Please try again.');
      setReport(previous => previous ? { ...previous, feedback: response.feedback } : previous);
      setRating(response.feedback.rating); setComment(response.feedback.comment);
      setMessage('Thank you. Your feedback has been saved.');
    } catch (reason) {
      if (alive.current) setSaveError(reason instanceof Error ? reason.message : 'Unable to save your feedback. Please try again.');
    } finally {
      working.current = false;
      if (alive.current) setSaving(false);
    }
  }

  async function openInvoice() {
    if (!report?.invoiceDownloadToken) return;
    try { await Linking.openURL(customerInvoiceUrl(report.refNumber, report.invoiceDownloadToken)); }
    catch { if (alive.current) setSaveError('Unable to open your invoice. Please try again.'); }
  }

  const vehicle = report ? [report.vehicle.registration, report.vehicle.make, report.vehicle.model].filter(Boolean).join(' · ') : '';
  const completedAt = report?.completedAt && Number.isFinite(Date.parse(report.completedAt))
    ? new Date(report.completedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : null;
  const photos = report?.photos.filter(photo => /^https:\/\//i.test(photo.url)) ?? [];
  const unchanged = report?.feedback?.rating === rating && report.feedback.comment === comment.trim();

  return <ScrollView contentContainerStyle={[styles.content, insets]} keyboardShouldPersistTaps="handled">
    <AppHeader onBack={() => router.canGoBack() ? router.back() : router.replace('/account')} />
    <ScreenHeader eyebrow={refNumber || 'YOUR BOOKING'} title="Your service report" detail="Your completed service, photos and feedback in one place." />
    {loading ? <LoadingState label="Loading your service report…" /> : error ? <Card>
      <InlineNotice tone="danger">{error}</InlineNotice>
      <PrimaryButton icon="refresh-cw" onPress={() => void load()}>Try again</PrimaryButton>
      <PrimaryButton variant="secondary" onPress={() => router.push('/account')}>Open my account</PrimaryButton>
    </Card> : report ? <>
      <Card style={styles.summaryCard}>
        <View style={styles.completedHeading}><Feather name="check-circle" size={25} color={colors.success} /><Text accessibilityRole="header" style={styles.heading}>Back on the road</Text></View>
        <Text style={styles.muted}>Your tyre service is complete. Keep this report with your vehicle records.</Text>
        <Row label="Service" value={humanService(report.serviceType)} />
        {completedAt ? <Row label="Completed" value={completedAt} /> : null}
        {vehicle ? <Row label="Vehicle" value={vehicle} /> : null}
        <Row label="Reference" value={report.refNumber} />
      </Card>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>Tyre details</Text>
        {report.tyres.length ? report.tyres.map((tyre, index) => <Text key={`${tyre.description}-${index}`} style={styles.tyreDescription}>{tyre.description}</Text>)
          : <Text style={styles.muted}>No replacement tyre details were recorded for this service.</Text>}
      </Card>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>Service photos</Text>
        <Text style={styles.muted}>Photos shared by your fitter during your service.</Text>
        {photos.length ? photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.url }} resizeMode="contain" style={styles.photo} accessibilityLabel={`Photo ${index + 1} shared by your fitter`} />)
          : <Text style={styles.muted}>No photos have been shared for this service.</Text>}
      </Card>
      {report.invoiceDownloadToken ? <PrimaryButton icon="download" variant="secondary" onPress={() => void openInvoice()}>Download invoice</PrimaryButton>
        : <Text style={styles.muted}>Your invoice is not available here yet. Contact us if you need a copy.</Text>}
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>How was your service?</Text>
        <Text style={styles.muted}>Your feedback is shared privately with our team.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Service rating" style={styles.stars}>
          {ratingLabels.map((label, index) => <Pressable key={label} accessibilityRole="radio"
            accessibilityLabel={`${index + 1} ${index === 0 ? 'star' : 'stars'}: ${label}`} accessibilityState={{ checked: rating === index + 1, disabled: saving }}
            disabled={saving} onPress={() => { if (!working.current) { setRating(index + 1); setMessage(''); } }}
            style={[styles.star, rating === index + 1 ? styles.selectedStar : null]}>
            <Feather accessible={false} name="star" size={27} color={rating >= index + 1 ? colors.accent : colors.muted} />
            <Text style={styles.starNumber}>{index + 1}</Text>
          </Pressable>)}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.ratingLabel}>{rating ? ratingLabels[rating - 1] : 'Choose a rating from 1 to 5'}</Text>
        <TextField label="Anything else? (optional)" value={comment} onChangeText={value => { if (!working.current) { setComment(value); setMessage(''); } }}
          multiline maxLength={1000} editable={!saving} placeholder="Tell us about your experience" inputStyle={styles.comment} />
        {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
        {saveError ? <InlineNotice tone="danger">{saveError}</InlineNotice> : null}
        <PrimaryButton icon="check" loading={saving} disabled={!rating || unchanged} onPress={() => void saveFeedback()}>{report.feedback ? 'Update feedback' : 'Save feedback'}</PrimaryButton>
      </Card>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>Need help with this service?</Text>
        <Text style={styles.muted}>Contact our support team about your completed booking.</Text>
        <PrimaryButton icon="message-circle" variant="secondary" onPress={() => router.push({ pathname: '/chat', params: { bookingId: report.bookingId, ref: report.refNumber, channel: 'customer_admin' } })}>Message support about this service</PrimaryButton>
        <PrimaryButton icon="phone" variant="ghost" onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }}>Call Tyre Rescue</PrimaryButton>
      </Card>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.bg, padding: spacing.page, gap: 18, flexGrow: 1 },
  summaryCard: { borderTopWidth: 3, borderTopColor: colors.success },
  completedHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 19 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  tyreDescription: { color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14, lineHeight: 22 },
  photo: { height: 230, width: '100%', borderRadius: 12, backgroundColor: colors.bg },
  stars: { flexDirection: 'row', gap: 7, justifyContent: 'space-between' },
  star: { minHeight: 64, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 3 },
  selectedStar: { borderColor: colors.accent, backgroundColor: '#3b230f' },
  starNumber: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  ratingLabel: { color: colors.text, fontFamily: typography.bodyMedium, textAlign: 'center', fontSize: 13 },
  comment: { minHeight: 100, textAlignVertical: 'top' },
});
