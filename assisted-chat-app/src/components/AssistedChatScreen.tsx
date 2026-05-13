import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAssistedChatDraft } from '@/hooks/useAssistedChatDraft';
import { useAssistedChatPrice } from '@/hooks/useAssistedChatPrice';
import { useAssistedChatDispatch } from '@/hooks/useAssistedChatDispatch';
import { useTodayBookings, type TodayBookingItem } from '@/hooks/useTodayBookings';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { useDuplicateBookingWarning } from '@/hooks/useDuplicateBookingWarning';
import type { RecentCustomer } from '@/types/assisted-chat';
import { LocationSection } from './LocationSection';
import { TyreSelectionSection } from './TyreSelectionSection';
import { LockingWheelNutSection } from './LockingWheelNutSection';
import { PriceSummary } from './PriceSummary';
import { ActionButtons } from './ActionButtons';
import { TodayBookingsModal } from './TodayBookingsModal';
import { RecentCustomersModal } from './RecentCustomersModal';
import { DuplicateBookingWarning } from './DuplicateBookingWarning';
import { CustomerMessageCard } from './CustomerMessageCard';
import { FailedActionRecovery } from './FailedActionRecovery';
import { PaymentLinkCard } from './PaymentLinkCard';
import { SectionCard, FieldLabel, InlineNotice, AppButton } from './ui';
import { colors, fontSize, radius } from './theme';
import { api } from '@/lib/api';
import { buildCustomerMessage, buildWhatsAppUrl } from '@/lib/customer-message';
import { copyToClipboard } from '@/lib/clipboard';
import { formatGbp } from '@/lib/money';

type WorkflowStepState = 'done' | 'active' | 'todo';

interface ParsedCallNotes {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  locationAddress?: string;
  tyreSize?: string;
  quantity?: number;
  lockingNutAnswer?: 'yes' | 'no' | 'unknown';
  lockingNutCharge?: number | null;
  paymentChoice?: 'cash' | 'deposit' | 'full';
  driverNote?: string;
}

function normalizeTyreSizeFromText(text: string): string | undefined {
  const match = text.match(/\b(\d{3})\s*[\/ -]?\s*(\d{2})\s*(?:[\/ -]?\s*r\s*|[\/ -]+)(\d{2})\b/i);
  if (!match) return undefined;
  return `${match[1]}/${match[2]}/R${match[3]}`;
}

function parseCallNotes(text: string): ParsedCallNotes {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const parsed: ParsedCallNotes = {};

  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) parsed.customerEmail = email;

  const phone = normalized.match(/(?:\+44\s?\d{4}|0\d{4}|01\d{3}|02\d{3})[\d\s-]{5,12}/)?.[0];
  if (phone) parsed.customerPhone = phone.replace(/\s{2,}/g, ' ').trim();

  const name = normalized.match(/\b(?:name is|customer is|customer name is)\s+([A-Za-z][A-Za-z' -]{1,42})(?=\s+(?:phone|number|email|address|at|location|tyre|size|needs|wants|payment|cash|deposit|full|locking)\b|$)/i)?.[1];
  if (name) parsed.customerName = name.trim();

  const tyreSize = normalizeTyreSizeFromText(normalized);
  if (tyreSize) parsed.tyreSize = tyreSize;

  const quantityMatch = normalized.match(/\b(?:qty|quantity|needs?|wants?|fit)\s*(?:x\s*)?(\d{1,2})\s*(?:tyres?|tires?|x)?\b/i)
    ?? normalized.match(/\bx\s*(\d{1,2})\b/i)
    ?? normalized.match(/\b(\d{1,2})\s*(?:tyres?|tires?)\b/i);
  if (quantityMatch) {
    const quantity = Number(quantityMatch[1]);
    if (Number.isFinite(quantity)) parsed.quantity = Math.max(1, Math.min(10, Math.round(quantity)));
  }

  const address = normalized.match(/\b(?:address|location|at)\s+(.+?)(?=\s+(?:phone|number|email|tyre|tire|size|needs|wants|payment|cash|deposit|full|locking|note)\b|$)/i)?.[1];
  if (address && address.length >= 5) parsed.locationAddress = address.replace(/[,. ]+$/, '').trim();

  if (/\b(?:has|with)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'yes';
  } else if (/\b(?:no|without|lost|missing|does not have|doesn't have)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'no';
  }

  const lockingCharge = normalized.match(/\b(?:locking|nut|removal)\D{0,16}(?:£|gbp)?\s*(\d{1,4}(?:\.\d{1,2})?)\b/i)?.[1];
  if (lockingCharge) {
    const charge = Number(lockingCharge);
    if (Number.isFinite(charge) && charge >= 0) {
      parsed.lockingNutAnswer = 'no';
      parsed.lockingNutCharge = Math.round(charge * 100) / 100;
    }
  }

  if (/\bdeposit\b/.test(lower)) parsed.paymentChoice = 'deposit';
  else if (/\b(?:full payment|pay full|paid full)\b/.test(lower)) parsed.paymentChoice = 'full';
  else if (/\bcash\b/.test(lower)) parsed.paymentChoice = 'cash';

  const driverNote = normalized.match(/\b(?:driver note|note)\s*[:\-]?\s+(.+)$/i)?.[1];
  if (driverNote) parsed.driverNote = driverNote.trim();

  return parsed;
}

interface AssistedChatScreenProps {
  user?: { name: string; email: string } | null;
  onLogout?: () => void | Promise<void>;
}

export function AssistedChatScreen({ user, onLogout }: AssistedChatScreenProps = {}) {
  const { draft, hydrated, update, clear } = useAssistedChatDraft();
  const [noteInput, setNoteInput] = useState('');
  const [noteSynced, setNoteSynced] = useState(false);
  const [callNotesInput, setCallNotesInput] = useState('');
  const [callAssistMessage, setCallAssistMessage] = useState<string | null>(null);

  if (hydrated && !noteSynced) {
    setNoteSynced(true);
    setNoteInput(draft.note);
  }

  const lockingNutCharge =
    draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const baseTotal = draft.quote?.total ?? 0;
  const effectiveTotal = baseTotal + lockingNutCharge;

  const price = useAssistedChatPrice({ draft, update });
  const todayBookings = useTodayBookings();
  const recentCustomers = useRecentCustomers();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  // Operator can dismiss the duplicate warning per-draft. Reset whenever
  // the dispatched ref clears (i.e. operator started a new booking).
  const [duplicateAck, setDuplicateAck] = useState(false);

  const duplicateMatch = useDuplicateBookingWarning({
    draft,
    todayBookings: todayBookings.items,
    recentCustomers: recentCustomers.items,
  });

  // Append a real booking to today's local history right after the server
  // confirms finalize. Uses the real `refNumber` returned by the existing
  // /api/admin/quick-book/[id]/finalize endpoint — no fake refs are ever
  // invented locally. Dedup is enforced inside useTodayBookings.
  const handleBookingCreated = useCallback(
    ({
      response,
      paymentChoice,
      effectiveTotal: total,
      paymentLink,
    }: {
      response: { bookingId: string; refNumber: string };
      paymentChoice: 'cash' | 'deposit' | 'full';
      effectiveTotal: number;
      paymentLink: { paymentUrl: string } | null;
    }) => {
      if (!response.refNumber) return;
      const item: TodayBookingItem = {
        bookingReference: response.refNumber,
        bookingId: response.bookingId,
        createdAtIso: new Date().toISOString(),
        paymentChoice,
        totalPence: Number.isFinite(total) ? Math.round(total * 100) : undefined,
        paymentLink: paymentLink?.paymentUrl,
        customerPhone: draft.customer.phone || undefined,
        customerAddress: draft.location.address || undefined,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
      };
      todayBookings.addBooking(item);
      // Mirror the operational fields into the recent-customers cache so the
      // operator can re-use them later. Only fires on real success.
      const recent: RecentCustomer = {
        customerPhone: draft.customer.phone || undefined,
        customerName: draft.customer.name || undefined,
        customerEmail: draft.customer.email || undefined,
        customerAddress: draft.location.address || undefined,
        lat: draft.location.lat,
        lng: draft.location.lng,
        postcode: draft.location.postcode,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
        note: draft.note || undefined,
        lastUsedAtIso: new Date().toISOString(),
        lastBookingReference: response.refNumber,
      };
      recentCustomers.saveCustomer(recent);
    },
    [draft, todayBookings, recentCustomers],
  );

  const dispatch = useAssistedChatDispatch({
    draft,
    update,
    lockingNutCharge,
    onBookingCreated: handleBookingCreated,
  });

  const handleClear = () => {
    clear();
    setNoteInput('');
    setCallNotesInput('');
    setCallAssistMessage(null);
    setNoteSynced(false);
    setDuplicateAck(false);
  };

  // True when there's enough draft content that overwriting would be lossy.
  const draftHasContent = Boolean(
    draft.customer.phone ||
      draft.customer.name ||
      draft.customer.email ||
      draft.location.address ||
      draft.location.lat != null ||
      draft.tyre.size ||
      draft.note ||
      draft.quote ||
      draft.dispatchedRefNumber,
  );

  const [phoneInput, setPhoneInput] = useState(draft.customer.phone);
  const [phoneSynced, setPhoneSynced] = useState(false);
  if (hydrated && !phoneSynced) {
    setPhoneSynced(true);
    setPhoneInput(draft.customer.phone);
  }
  const handlePhoneBlur = () => {
    update({ customer: { ...draft.customer, phone: phoneInput.trim() } });
  };

  const handleUseRecent = useCallback(
    (item: RecentCustomer) => {
      // Replace operational fields only — do not invent any booking state
      // or call any API.
      update({
        customer: {
          phone: item.customerPhone ?? '',
          name: item.customerName ?? '',
          email: item.customerEmail ?? '',
        },
        location: {
          method: item.lat != null && item.lng != null ? 'address' : 'address',
          address: item.customerAddress ?? '',
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          postcode: item.postcode ?? null,
          link: null,
          whatsappLink: null,
          status: item.lat != null && item.lng != null ? 'received' : 'idle',
        },
        tyre: {
          size: item.tyreSize ?? '',
          quantity: item.quantity ?? 1,
        },
        note: item.note ?? '',
        quickBookingId: null,
        quote: null,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
      });
      setPhoneInput(item.customerPhone ?? '');
      setNoteInput(item.note ?? '');
      setDuplicateAck(false);
    },
    [update],
  );

  // Normalize a UK-leaning phone number to digits only, defaulting a leading
  // 0 to the +44 country code so wa.me accepts it. Returns null when the
  // input has no usable digits, so the header button can stay disabled.
  const customerWhatsAppNumber = (() => {
    const raw = draft.customer.phone ?? '';
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return null;
    if (raw.trim().startsWith('+')) return digits;
    if (digits.startsWith('44')) return digits;
    if (digits.startsWith('0')) return `44${digits.slice(1)}`;
    return digits;
  })();

  const handleOpenWhatsApp = useCallback(async () => {
    if (!customerWhatsAppNumber) return;
    const message = buildCustomerMessage({
      draft,
      effectiveTotal,
      paymentChoice: draft.paymentChoice,
    });
    const url =
      buildWhatsAppUrl(draft.customer.phone, message) ??
      `https://wa.me/${customerWhatsAppNumber}`;
    try {
      await Linking.openURL(url);
    } catch {
      // Best-effort — if WhatsApp/web isn't available the OS will surface its
      // own error. We deliberately don't block the operator with an alert.
    }
  }, [customerWhatsAppNumber, draft, effectiveTotal]);

  const customerDialNumber = (() => {
    const raw = (draft.customer.phone ?? '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    return cleaned || null;
  })();

  const handleCallCustomer = useCallback(async () => {
    if (!customerDialNumber) return;
    try {
      await Linking.openURL(`tel:${customerDialNumber}`);
    } catch {
      // tel: is unsupported on web/desktop browsers — silently no-op so the
      // operator can fall back to WhatsApp or copy the number.
    }
  }, [customerDialNumber]);

  const handleSendToDriver = () => {
    // Reuses the existing finalize endpoint — same as choosing payment.
    if (!draft.paymentChoice) return;
    dispatch.choosePaymentAndDispatch(draft.paymentChoice);
  };

  const customerMessage = buildCustomerMessage({
    draft,
    effectiveTotal,
    paymentChoice: draft.paymentChoice,
  });

  const hasCustomer = Boolean(
    draft.customer.phone.trim() || draft.customer.name.trim() || draft.customer.email.trim(),
  );
  const hasLocation = draft.location.lat != null && draft.location.lng != null;
  const hasTyre = Boolean(draft.tyre.size.trim() && draft.tyre.quantity >= 1);
  const hasQuote = Boolean(draft.quote);
  const hasPaymentChoice = Boolean(draft.paymentChoice);
  const hasDispatched = Boolean(draft.dispatchedRefNumber);

  const workflowSteps: Array<{ label: string; value: string; state: WorkflowStepState }> = [
    {
      label: 'Customer',
      value: hasCustomer ? draft.customer.phone || draft.customer.name || draft.customer.email : 'Add details',
      state: hasCustomer ? 'done' : 'active',
    },
    {
      label: 'Location',
      value: hasLocation ? 'Confirmed' : draft.location.method === 'link' && draft.location.status === 'pending' ? 'Waiting for link' : 'Needed',
      state: hasLocation ? 'done' : hasCustomer ? 'active' : 'todo',
    },
    {
      label: 'Tyre',
      value: hasTyre ? `${draft.tyre.size} x ${draft.tyre.quantity}` : 'Needed',
      state: hasTyre ? 'done' : hasLocation ? 'active' : 'todo',
    },
    {
      label: 'Price',
      value: draft.priceNeedsRefresh ? 'Needs refresh' : hasQuote ? formatGbp(effectiveTotal) : hasLocation && hasTyre ? 'Ready' : 'Blocked',
      state: draft.priceNeedsRefresh ? 'active' : hasQuote ? 'done' : hasLocation && hasTyre ? 'active' : 'todo',
    },
    {
      label: 'Payment',
      value: hasPaymentChoice ? draft.paymentChoice!.toUpperCase() : 'Choose',
      state: hasPaymentChoice ? 'done' : hasQuote ? 'active' : 'todo',
    },
    {
      label: 'Dispatch',
      value: hasDispatched ? draft.dispatchedRefNumber! : 'Send',
      state: hasDispatched ? 'done' : hasPaymentChoice ? 'active' : 'todo',
    },
  ];

  const nextAction = (() => {
    if (!hasLocation) {
      const locationAction = draft.location.method === 'link' && draft.location.status === 'pending'
        ? 'Wait for the customer location link, or switch to Enter Address if they can read the address out.'
        : 'Confirm the customer location before pricing.';
      return hasCustomer ? locationAction : `Ask for the customer name or phone number, then ${locationAction.toLowerCase()}`;
    }
    if (!hasTyre) return 'Enter the tyre size and quantity, then pick an in-stock match.';
    if (draft.priceNeedsRefresh) return 'Tap Get price again because the address or tyre details changed.';
    if (!hasQuote) return 'Tap Get price to calculate the callout, distance, tyre and fitting total.';
    if (!hasPaymentChoice) {
      return hasCustomer
        ? 'Choose how the customer will pay: deposit, cash, or full payment.'
        : 'Add customer details if possible, then choose deposit, cash, or full payment.';
    }
    if (!hasDispatched) return 'Send it to driver, then share the customer message or payment link.';
    return 'Booking is created. Clear the draft when you are ready for the next customer.';
  })();

  const pricingDisabledReason = (() => {
    if (!hasLocation) return 'Price is locked until the customer location is confirmed.';
    if (!hasTyre) return 'Enter a tyre size before getting the price.';
    return null;
  })();

  const handleCopyCustomerMessage = useCallback(async () => {
    await copyToClipboard(customerMessage);
  }, [customerMessage]);

  const handleApplyCallNotes = useCallback(() => {
    const parsed = parseCallNotes(callNotesInput);
    const applied: string[] = [];
    const patch: Partial<typeof draft> = {};

    if (parsed.customerName || parsed.customerPhone || parsed.customerEmail) {
      patch.customer = {
        ...draft.customer,
        ...(parsed.customerName ? { name: parsed.customerName } : {}),
        ...(parsed.customerPhone ? { phone: parsed.customerPhone } : {}),
        ...(parsed.customerEmail ? { email: parsed.customerEmail } : {}),
      };
      if (parsed.customerName) applied.push('name');
      if (parsed.customerPhone) applied.push('phone');
      if (parsed.customerEmail) applied.push('email');
    }

    if (parsed.locationAddress) {
      patch.location = {
        ...draft.location,
        method: 'address',
        address: parsed.locationAddress,
        lat: null,
        lng: null,
        postcode: null,
        link: null,
        whatsappLink: null,
        status: 'idle',
      };
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentChoice = null;
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
      applied.push('address text');
    }

    if (parsed.tyreSize || parsed.quantity) {
      patch.tyre = {
        ...draft.tyre,
        ...(parsed.tyreSize ? { size: parsed.tyreSize } : {}),
        ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
      };
      if (parsed.tyreSize) applied.push('tyre size');
      if (parsed.quantity) applied.push('quantity');
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
    }

    if (parsed.lockingNutAnswer) {
      patch.lockingNut = {
        answer: parsed.lockingNutAnswer,
        chargeGbp: parsed.lockingNutAnswer === 'no' ? parsed.lockingNutCharge ?? draft.lockingNut.chargeGbp : null,
      };
      applied.push('locking nut');
    }

    if (parsed.paymentChoice && draft.quote) {
      patch.paymentChoice = parsed.paymentChoice;
      applied.push('payment choice');
    }

    if (parsed.driverNote) {
      const nextNote = draft.note.trim()
        ? `${draft.note.trim()}\n${parsed.driverNote}`
        : parsed.driverNote;
      patch.note = nextNote;
      setNoteInput(nextNote);
      applied.push('driver note');
    }

    if (applied.length === 0) {
      setCallAssistMessage('No obvious details found. Try including a phone, address, tyre size, quantity, or payment word.');
      return;
    }

    if (parsed.customerPhone) setPhoneInput(parsed.customerPhone);
    update(patch);
    setDuplicateAck(false);
    setCallAssistMessage(`Applied: ${applied.join(', ')}.`);
  }, [callNotesInput, draft, update]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Assisted Chat</Text>
              <Pressable
                onPress={() => setHistoryOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Open today's bookings list. ${todayBookings.count} bookings created today.`}
                style={({ pressed }) => [
                  styles.counterPill,
                  pressed && styles.counterPillPressed,
                ]}
              >
                <Text style={styles.counterLabel}>Bookings today</Text>
                <Text style={styles.counterValue}>{todayBookings.count}</Text>
              </Pressable>
            </View>
            <Text style={styles.headerSub}>
              {user?.name ? `Signed in as ${user.name}` : 'Operator booking flow'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.headerActionRow}>
              <Pressable
                onPress={customerWhatsAppNumber ? handleOpenWhatsApp : undefined}
                disabled={!customerWhatsAppNumber}
                accessibilityRole="button"
                accessibilityLabel="Open WhatsApp chat with customer"
                style={({ pressed }) => [
                  styles.whatsappBtn,
                  pressed && customerWhatsAppNumber && styles.whatsappBtnPressed,
                  !customerWhatsAppNumber && styles.whatsappBtnDisabled,
                ]}
              >
                <View style={styles.whatsappIconWrap}>
                  <View style={styles.whatsappBubble}>
                    <Text style={styles.whatsappBubbleGlyph}>☎</Text>
                  </View>
                  <View style={styles.whatsappBubbleTail} />
                </View>
                <Text style={styles.whatsappLabel}>WhatsApp</Text>
              </Pressable>
              <Pressable
                onPress={customerDialNumber ? handleCallCustomer : undefined}
                disabled={!customerDialNumber}
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                style={({ pressed }) => [
                  styles.callBtn,
                  pressed && customerDialNumber && styles.callBtnPressed,
                  !customerDialNumber && styles.callBtnDisabled,
                ]}
              >
                <View style={styles.callIconWrap}>
                  <Text style={styles.callIconGlyph}>☎</Text>
                </View>
                <Text style={styles.callLabel}>Call</Text>
              </Pressable>
            </View>
            <View style={styles.headerActionRow}>
              <AppButton
                label="Clear draft"
                variant="ghost"
                onPress={handleClear}
                style={styles.headerBtn}
              />
              {onLogout ? (
                <AppButton
                  label="Log out"
                  variant="ghost"
                  onPress={() => {
                    void onLogout();
                  }}
                  style={styles.headerBtn}
                />
              ) : null}
            </View>
          </View>
        </View>

        {!api.hasAdminToken ? (
          <InlineNotice kind="warn">
            No admin token. Log in to enable API calls.
          </InlineNotice>
        ) : null}

        <View style={styles.recentRow}>
          <AppButton
            label="Recent customers"
            variant="secondary"
            onPress={() => setRecentOpen(true)}
            style={styles.recentBtn}
          />
        </View>

        <View style={styles.operatorPanel}>
          <View style={styles.operatorPanelHeader}>
            <Text style={styles.operatorPanelTitle}>Next best action</Text>
            {draft.updatedAt ? (
              <Text style={styles.operatorPanelMeta}>Draft saved</Text>
            ) : null}
          </View>
          <Text style={styles.operatorNextText}>{nextAction}</Text>
          <View style={styles.workflowGrid}>
            {workflowSteps.map((step) => (
              <View
                key={step.label}
                style={[
                  styles.workflowPill,
                  step.state === 'done' && styles.workflowPillDone,
                  step.state === 'active' && styles.workflowPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.workflowLabel,
                    step.state === 'done' && styles.workflowLabelDone,
                    step.state === 'active' && styles.workflowLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
                <Text
                  style={[
                    styles.workflowValue,
                    step.state === 'done' && styles.workflowValueDone,
                    step.state === 'active' && styles.workflowValueActive,
                  ]}
                  numberOfLines={1}
                >
                  {step.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <SectionCard
          title="Smart call notes"
          helperText="Paste rough call notes and apply obvious details. Address still needs selecting from suggestions for coordinates."
        >
          <TextInput
            value={callNotesInput}
            onChangeText={(value) => {
              setCallNotesInput(value);
              setCallAssistMessage(null);
            }}
            placeholder="Example: customer is Ali, 07700 900123, address 3 Gateside Street, needs 205/55R16 x2, cash, note side street"
            placeholderTextColor={colors.subtle}
            style={styles.callNotesInput}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.callNotesActions}>
            <AppButton
              label="Apply notes"
              variant="secondary"
              onPress={handleApplyCallNotes}
              disabled={!callNotesInput.trim()}
              style={styles.callNotesButton}
            />
            <AppButton
              label="Clear notes"
              variant="ghost"
              onPress={() => {
                setCallNotesInput('');
                setCallAssistMessage(null);
              }}
              disabled={!callNotesInput.trim()}
              style={styles.callNotesButton}
            />
          </View>
          {callAssistMessage ? (
            <View style={{ marginTop: 10 }}>
              <InlineNotice kind={callAssistMessage.startsWith('Applied:') ? 'info' : 'warn'}>
                {callAssistMessage}
              </InlineNotice>
            </View>
          ) : null}
        </SectionCard>

        {/* ── Main assisted chat card ── */}
        <View style={styles.mainCard}>
          <View style={styles.mainCardInner}>
            {/* Customer phone (kept; used by WhatsApp/Call header buttons). */}
            <SectionCard title="Customer">
              <FieldLabel>Customer name</FieldLabel>
              <TextInput
                value={draft.customer.name}
                onChangeText={(name) => update({ customer: { ...draft.customer, name } })}
                placeholder="Name"
                placeholderTextColor={colors.subtle}
                style={styles.phoneInput}
              />
              <View style={{ height: 10 }} />
              <FieldLabel>Customer phone (optional)</FieldLabel>
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                onBlur={handlePhoneBlur}
                placeholder="07… or 0141…"
                placeholderTextColor={colors.subtle}
                keyboardType="phone-pad"
                style={styles.phoneInput}
              />
              <View style={{ height: 10 }} />
              <FieldLabel>Customer email (optional)</FieldLabel>
              <TextInput
                value={draft.customer.email}
                onChangeText={(email) => update({ customer: { ...draft.customer, email } })}
                placeholder="you@example.com"
                placeholderTextColor={colors.subtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.phoneInput}
              />
            </SectionCard>

            <LocationSection draft={draft} update={update} />

            <TyreSelectionSection draft={draft} update={update} />
            <LockingWheelNutSection draft={draft} update={update} />

            <SectionCard title="Optional note">
              <FieldLabel>Admin note (optional)</FieldLabel>
              <TextInput
                value={noteInput}
                onChangeText={setNoteInput}
                onBlur={() => update({ note: noteInput })}
                placeholder="Anything the driver should know"
                placeholderTextColor={colors.subtle}
                style={styles.note}
                multiline
                textAlignVertical="top"
              />
            </SectionCard>

            <PriceSummary
              quote={draft.quote}
              lockingNutCharge={lockingNutCharge}
              loading={price.loading}
              stageIdx={price.stageIdx}
              stageLabels={price.stageLabels}
              error={price.error}
              onGetPrice={price.getPrice}
              onChoosePayment={dispatch.choosePaymentAndDispatch}
              paymentChoice={draft.paymentChoice}
              paymentBusy={dispatch.busy}
              paymentError={dispatch.error}
              paymentLink={draft.paymentLink}
              dispatchedRefNumber={draft.dispatchedRefNumber}
              pricingBlocked={!hasLocation || !hasTyre}
              priceNeedsRefresh={draft.priceNeedsRefresh}
              beforeGetPriceSlot={
                <>
                  {pricingDisabledReason ? (
                    <View style={{ marginBottom: 10 }}>
                      <InlineNotice kind="info">{pricingDisabledReason}</InlineNotice>
                    </View>
                  ) : null}
                  <DuplicateBookingWarning
                    match={duplicateMatch}
                    acknowledged={duplicateAck}
                    onReview={() => setHistoryOpen(true)}
                    onContinueAnyway={() => setDuplicateAck(true)}
                  />
                </>
              }
              afterGetPriceSlot={
                price.error ? (
                  <FailedActionRecovery
                    title="Price could not be calculated."
                    message={price.error}
                    actions={[
                      { label: 'Retry', variant: 'primary', onPress: price.getPrice },
                      { label: 'Copy details', variant: 'secondary', onPress: handleCopyCustomerMessage },
                    ]}
                  />
                ) : null
              }
              afterPaymentSlot={
                <View style={{ marginTop: 12, gap: 12 }}>
                  {dispatch.error ? (
                    <FailedActionRecovery
                      title={
                        draft.paymentChoice === 'cash'
                          ? 'Booking could not be created.'
                          : 'Payment link could not be created.'
                      }
                      message={dispatch.error}
                      actions={[
                        {
                          label: 'Retry',
                          variant: 'primary',
                          onPress: () => {
                            if (draft.paymentChoice) {
                              dispatch.choosePaymentAndDispatch(draft.paymentChoice);
                            }
                          },
                        },
                        { label: 'Copy message', variant: 'secondary', onPress: handleCopyCustomerMessage },
                        { label: 'Open WhatsApp', variant: 'secondary', onPress: handleOpenWhatsApp },
                      ]}
                    />
                  ) : null}
                  {draft.paymentLink ? (
                    <PaymentLinkCard
                      paymentLink={draft.paymentLink}
                      draft={draft}
                      effectiveTotal={effectiveTotal}
                    />
                  ) : null}
                  {(draft.paymentChoice || draft.dispatchedRefNumber) ? (
                    <CustomerMessageCard
                      message={customerMessage}
                      customerPhone={draft.customer.phone}
                    />
                  ) : null}
                </View>
              }
            />
          </View>
        </View>

        {/* External actions outside the main card. */}
        <ActionButtons
          draft={draft}
          effectiveTotal={effectiveTotal}
          lockingNutCharge={lockingNutCharge}
          onSendToDriver={handleSendToDriver}
          dispatchBusy={dispatch.busy}
          dispatchError={dispatch.error}
          dispatchRecoverySlot={
            dispatch.error ? (
              <FailedActionRecovery
                title="Booking could not be sent to driver."
                message={dispatch.error}
                actions={[
                  {
                    label: 'Retry',
                    variant: 'primary',
                    onPress: handleSendToDriver,
                  },
                  { label: 'Copy details', variant: 'secondary', onPress: handleCopyCustomerMessage },
                  { label: 'Open WhatsApp', variant: 'secondary', onPress: handleOpenWhatsApp },
                ]}
              />
            ) : null
          }
        />

        <View style={{ height: 24 }} />
      </ScrollView>
      <TodayBookingsModal
        visible={historyOpen}
        items={todayBookings.items}
        onClose={() => setHistoryOpen(false)}
      />
      <RecentCustomersModal
        visible={recentOpen}
        items={recentCustomers.items}
        draftHasContent={draftHasContent}
        onClose={() => setRecentOpen(false)}
        onUseCustomer={handleUseRecent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: { padding: 12, gap: 12 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentBtn: { minHeight: 36, paddingHorizontal: 12 },
  operatorPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  operatorPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  operatorPanelTitle: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  operatorPanelMeta: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  operatorNextText: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: '700',
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  workflowPill: {
    minWidth: 112,
    flexGrow: 1,
    flexBasis: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  workflowPillDone: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  workflowPillActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  workflowLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  workflowLabelDone: { color: colors.success },
  workflowLabelActive: { color: colors.accent },
  workflowValue: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  workflowValueDone: { color: colors.text },
  workflowValueActive: { color: colors.text },
  callNotesInput: {
    minHeight: 86,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
    lineHeight: 20,
  },
  callNotesActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  callNotesButton: {
    minHeight: 38,
    flexGrow: 1,
  },
  header: {
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.card,
  },
  counterPillPressed: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  counterLabel: {
    fontSize: fontSize.xs,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  counterValue: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '700',
  },
  headerSub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  headerBtn: { minHeight: 32, paddingHorizontal: 10 },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: '#25D366',
    borderWidth: 1,
    borderColor: '#1FB855',
  },
  whatsappBtnPressed: { backgroundColor: '#1FB855' },
  whatsappBtnDisabled: { opacity: 0.4 },
  whatsappIconWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  whatsappBubble: {
    width: 18,
    height: 16,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappBubbleGlyph: { color: '#25D366', fontSize: 10, fontWeight: '900', lineHeight: 12 },
  whatsappBubbleTail: {
    position: 'absolute',
    bottom: -1,
    left: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 0,
    borderTopWidth: 5,
    borderLeftColor: '#FFFFFF',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    borderStyle: 'solid',
  },
  whatsappLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: fontSize.sm },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  callBtnPressed: { opacity: 0.85 },
  callBtnDisabled: { opacity: 0.4 },
  callIconWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  callIconGlyph: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  callLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: fontSize.sm },
  mainCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  mainCardInner: { gap: 12 },
  phoneInput: {
    minHeight: 44,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  note: {
    minHeight: 96,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: fontSize.md,
  },
});
