import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import type {
  LocationShareContactOverride,
  LocationShareMethod,
} from '@/hooks/useAssistedChatLocationShare';
import {
  formatAssistedChatServiceType,
  summarizeBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import {
  formatGbp,
  getEmailDomainSuggestions,
  isValidUkPhone,
  normalizeContactPhone,
  normalizeEmailAddress,
  normalizeUkMobilePhoneNumber,
} from '@/lib/money';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

const senderPanelShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 8px 14px rgba(0,0,0,0.22)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }
) as ViewStyle;

const senderTemplateShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 7px 12px rgba(0,0,0,0.18)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 7 },
        elevation: 2,
      }
) as ViewStyle;

type MessageTemplateId =
  | 'quote_close'
  | 'location_request'
  | 'payment_link'
  | 'booking_confirmed'
  | 'driver_en_route'
  | 'driver_nearby'
  | 'delay_update'
  | 'job_complete'
  | 'reassurance';

type MessageChannel = 'whatsapp' | 'sms' | 'email' | 'copy';

interface MessageNotice {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

interface MessageSenderModalProps {
  visible: boolean;
  draft: AssistedChatDraft;
  effectiveTotal: number;
  trackingUrl?: string | null;
  driverName?: string | null;
  etaMinutes?: number | null;
  delayMinutes?: number | null;
  locationBusy: LocationShareMethod | null;
  canCreateLocationLink: boolean;
  onClose: () => void;
  onRequestLocation: (method: LocationShareMethod, contact?: LocationShareContactOverride) => Promise<void>;
  onSaveCustomerContact: (contact: { phone: string; email: string }) => void;
  onNotice?: (notice: MessageNotice) => void;
}

interface MessageTemplate {
  id: MessageTemplateId;
  title: string;
  category: string;
  description: string;
  message: string;
  disabledReason: string | null;
}

interface TemplateContext {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  trackingUrl: string | null;
  driverName: string | null;
  etaMinutes: number | null;
  delayMinutes: number | null;
  canCreateLocationLink: boolean;
  contactPhone: string;
  contactEmail: string;
}

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  copy: 'Copy',
};

function firstName(draft: AssistedChatDraft): string {
  return draft.customer.name.trim().split(/\s+/)[0] || 'there';
}

function referenceLine(draft: AssistedChatDraft): string | null {
  if (draft.dispatchedRefNumber) return `Booking ref: ${draft.dispatchedRefNumber}`;
  if (draft.savedQuoteRef) return `Quote ref: ${draft.savedQuoteRef}`;
  return null;
}

function jobLines(draft: AssistedChatDraft, effectiveTotal: number): string[] {
  const lines: string[] = [];
  const ref = referenceLine(draft);
  if (ref) lines.push(ref);
  lines.push(`Service: ${formatAssistedChatServiceType(draft.serviceType)}`);

  const tyres = summarizeBookingTyreLines(draft.tyreLines);
  if (draft.serviceType === 'assess') {
    lines.push('Final tyre cost will be confirmed after inspection.');
  } else if (tyres.length) {
    lines.push('Tyres:');
    tyres.forEach((line) => lines.push(`- ${line}`));
  }
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.quote && Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    lines.push(`${draft.dispatchedRefNumber ? 'Total' : 'Quote total'}: ${formatGbp(effectiveTotal)}`);
  }
  return lines;
}

function compactEta(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return `${Math.max(0, Math.round(minutes))} minutes`;
}

function joinMessage(lines: string[]): string {
  return lines.filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}

function buildTemplates(ctx: TemplateContext): MessageTemplate[] {
  const {
    draft,
    effectiveTotal,
    trackingUrl,
    driverName,
    etaMinutes,
    delayMinutes,
    canCreateLocationLink,
    contactPhone,
    contactEmail,
  } = ctx;
  const name = firstName(draft);
  const baseDetails = jobLines(draft, effectiveTotal);
  const locationLink = draft.location.link;
  const paymentLink = draft.paymentLink?.paymentUrl ?? null;
  const eta = compactEta(etaMinutes);
  const delay = compactEta(delayMinutes);

  return [
    {
      id: 'quote_close',
      title: 'Price + close',
      category: 'Quote',
      description: 'Strong quote message asking the customer to confirm.',
      disabledReason: draft.quote ? null : 'Get a price first.',
      message: joinMessage([
        `Hi ${name}, this is Tyre Rescue.`,
        'Good news, we can help with your tyre today.',
        '',
        ...baseDetails,
        '',
        'Reply YES and we will lock this in for you now.',
      ]),
    },
    {
      id: 'location_request',
      title: 'Request location',
      category: 'Link',
      description: locationLink ? 'Send the existing secure location link.' : 'Create and send a secure location link.',
      disabledReason: locationLink || canCreateLocationLink ? null : 'Log in before creating a location link.',
      message: joinMessage([
        `Hi ${name}, this is Tyre Rescue.`,
        'Please share your exact vehicle location using this secure link so we can send the driver to the right place.',
        locationLink ? '' : 'The app will create the link when you press send.',
        locationLink ? locationLink : '',
      ]),
    },
    {
      id: 'payment_link',
      title: 'Payment link',
      category: 'Link',
      description: 'Send the Stripe payment link with the amount.',
      disabledReason: paymentLink ? null : 'Create a payment link first.',
      message: joinMessage([
        `Hi ${name}, your Tyre Rescue payment link is ready.`,
        draft.paymentLink?.kind === 'deposit'
          ? `Please pay the deposit now: ${formatGbp(draft.paymentLink.amountPence / 100)}`
          : draft.paymentLink
            ? `Amount due: ${formatGbp(draft.paymentLink.amountPence / 100)}`
            : '',
        paymentLink ?? '',
        draft.paymentLink?.remainingBalancePence != null
          ? `Balance due on arrival: ${formatGbp(draft.paymentLink.remainingBalancePence / 100)}`
          : '',
      ]),
    },
    {
      id: 'booking_confirmed',
      title: 'Booking confirmed',
      category: 'Update',
      description: 'Confident confirmation with booking details.',
      disabledReason: draft.dispatchedRefNumber || draft.savedQuoteRef ? null : 'Save a quote or dispatch the booking first.',
      message: joinMessage([
        `Hi ${name}, your Tyre Rescue booking is confirmed.`,
        '',
        ...baseDetails,
        trackingUrl ? `Track your driver here: ${trackingUrl}` : '',
        '',
        'We will keep you updated when the driver is on the way.',
      ]),
    },
    {
      id: 'driver_en_route',
      title: 'Driver on way',
      category: 'Update',
      description: 'Let the customer know the driver is moving.',
      disabledReason: draft.dispatchedRefNumber || draft.dispatchedBookingId ? null : 'Dispatch the booking first.',
      message: joinMessage([
        `Hi ${name}, your Tyre Rescue driver is on the way now.`,
        driverName ? `Driver: ${driverName}` : '',
        eta ? `Estimated arrival: around ${eta}.` : '',
        trackingUrl ? `Live tracking: ${trackingUrl}` : '',
        '',
        'Please make sure the vehicle is accessible.',
      ]),
    },
    {
      id: 'driver_nearby',
      title: 'Driver nearby',
      category: 'Update',
      description: 'Short alert when the driver is close.',
      disabledReason: draft.dispatchedRefNumber || draft.dispatchedBookingId ? null : 'Dispatch the booking first.',
      message: joinMessage([
        `Hi ${name}, your Tyre Rescue driver is nearby.`,
        eta ? `They should be with you in about ${eta}.` : 'They should be with you very shortly.',
        '',
        'Please have the locking wheel nut key ready if your vehicle has one.',
      ]),
    },
    {
      id: 'delay_update',
      title: 'Delay update',
      category: 'Update',
      description: 'Keeps trust if traffic or a prior job causes delay.',
      disabledReason: draft.dispatchedRefNumber || draft.dispatchedBookingId ? null : 'Dispatch the booking first.',
      message: joinMessage([
        `Hi ${name}, quick update from Tyre Rescue.`,
        delay ? `Your driver is delayed by around ${delay}.` : 'Your driver has been slightly delayed.',
        'We are monitoring the job and will keep you updated.',
        trackingUrl ? `Live tracking: ${trackingUrl}` : '',
      ]),
    },
    {
      id: 'job_complete',
      title: 'Job complete',
      category: 'Aftercare',
      description: 'Clean close after the job is done.',
      disabledReason: draft.dispatchedRefNumber || draft.dispatchedBookingId ? null : 'Dispatch the booking first.',
      message: joinMessage([
        `Hi ${name}, your Tyre Rescue job is now complete.`,
        referenceLine(draft) ?? '',
        '',
        'Thank you for choosing Tyre Rescue. If you need anything else, reply here and we will help.',
      ]),
    },
    {
      id: 'reassurance',
      title: 'Keep calm',
      category: 'Support',
      description: 'Useful when the customer is worried or stuck roadside.',
      disabledReason: contactPhone || contactEmail ? null : 'Add customer contact details first.',
      message: joinMessage([
        `Hi ${name}, Tyre Rescue here.`,
        'We have your details and we are working on this now.',
        'Stay safe and keep away from traffic if you are roadside.',
        trackingUrl ? `You can use this link for updates: ${trackingUrl}` : '',
        '',
        'We will keep you updated from here.',
      ]),
    },
  ];
}

function buildSmsUrl(phone: string, message: string): string | null {
  const cleaned = normalizeUkMobilePhoneNumber(phone);
  if (!cleaned) return null;
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:+${cleaned}${separator}body=${encodeURIComponent(message)}`;
}

function buildEmailUrl(email: string, subject: string, message: string): string | null {
  const trimmed = normalizeEmailAddress(email);
  if (!trimmed) return null;
  return `mailto:${encodeURIComponent(trimmed)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

function locationMethodForChannel(channel: MessageChannel): LocationShareMethod {
  if (channel === 'sms') return 'sms';
  if (channel === 'email') return 'email';
  if (channel === 'whatsapp') return 'whatsapp';
  return 'copy';
}

export function MessageSenderModal({
  visible,
  draft,
  effectiveTotal,
  trackingUrl = null,
  driverName = null,
  etaMinutes = null,
  delayMinutes = null,
  locationBusy,
  canCreateLocationLink,
  onClose,
  onRequestLocation,
  onSaveCustomerContact,
  onNotice,
}: MessageSenderModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<MessageTemplateId>('quote_close');
  const [selectedChannel, setSelectedChannel] = useState<MessageChannel>('whatsapp');
  const [messageText, setMessageText] = useState('');
  const [phoneInput, setPhoneInput] = useState(draft.customer.phone);
  const [emailInput, setEmailInput] = useState(draft.customer.email);
  const [sendingChannel, setSendingChannel] = useState<MessageChannel | null>(null);
  const [notice, setNotice] = useState<MessageNotice | null>(null);

  const templates = useMemo(
    () =>
      buildTemplates({
        draft,
        effectiveTotal,
        trackingUrl,
        driverName,
        etaMinutes,
        delayMinutes,
        canCreateLocationLink,
        contactPhone: phoneInput.trim(),
        contactEmail: emailInput.trim(),
      }),
    [canCreateLocationLink, delayMinutes, draft, driverName, effectiveTotal, etaMinutes, trackingUrl, phoneInput, emailInput],
  );
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

  useEffect(() => {
    if (!visible) return;
    setPhoneInput(draft.customer.phone);
    setEmailInput(draft.customer.email);
  }, [draft.customer.email, draft.customer.phone, visible]);

  useEffect(() => {
    if (!visible) return;
    setMessageText(selectedTemplate.message);
  }, [selectedTemplate.id, selectedTemplate.message, visible]);

  useEffect(() => {
    if (!visible) return;
    const current = templates.find((template) => template.id === selectedTemplateId);
    if (!current || current.disabledReason) {
      const firstEnabled = templates.find((template) => !template.disabledReason);
      if (firstEnabled) setSelectedTemplateId(firstEnabled.id);
    }
  }, [selectedTemplateId, templates, visible]);

  const notify = (next: MessageNotice) => {
    setNotice(next);
    onNotice?.(next);
  };

  const customerPhone = normalizeContactPhone(phoneInput);
  const customerEmail = normalizeEmailAddress(emailInput);
  const emailSuggestions = useMemo(() => getEmailDomainSuggestions(emailInput), [emailInput]);
  const contactDirty =
    customerPhone !== draft.customer.phone.trim() ||
    customerEmail !== draft.customer.email.trim();
  const saveContact = () => {
    onSaveCustomerContact({ phone: customerPhone, email: customerEmail });
    notify({ kind: 'ok', text: 'Customer contact saved.' });
  };
  const channelReason = (() => {
    if (selectedChannel === 'copy') return null;
    if (selectedChannel === 'email') return customerEmail ? null : 'Add customer email first.';
    if (selectedChannel === 'sms') return isValidUkPhone(customerPhone) ? null : 'Add a valid UK mobile number first.';
    return customerPhone ? null : 'Add customer phone first.';
  })();
  const externalBusy = locationBusy !== null;
  const internalBusy = sendingChannel !== null;
  const sendDisabled = Boolean(
    selectedTemplate.disabledReason ||
      channelReason ||
      !messageText.trim() ||
      externalBusy ||
      internalBusy,
  );

  const sendMessage = async () => {
    if (sendDisabled) return;
    const channel = selectedChannel;
    setSendingChannel(channel);
    setNotice(null);
    try {
      if (contactDirty) {
        onSaveCustomerContact({ phone: customerPhone, email: customerEmail });
      }
      if (selectedTemplate.id === 'location_request' && !draft.location.link) {
        await onRequestLocation(locationMethodForChannel(channel), {
          phone: customerPhone,
          email: customerEmail,
        });
        notify({ kind: 'ok', text: 'Location request sent.' });
        return;
      }

      const message = messageText.trim();
      if (channel === 'copy') {
        const ok = await copyToClipboard(message);
        notify({ kind: ok ? 'ok' : 'err', text: ok ? 'Message copied.' : 'Could not copy message.' });
        return;
      }

      let url: string | null = null;
      if (channel === 'whatsapp') {
        url = buildWhatsAppUrl(customerPhone, message);
      } else if (channel === 'sms') {
        url = buildSmsUrl(customerPhone, message);
      } else if (channel === 'email') {
        url = buildEmailUrl(customerEmail, selectedTemplate.title, message);
      }

      if (!url) {
        notify({ kind: 'err', text: 'This send method needs customer contact details.' });
        return;
      }

      await Linking.openURL(url);
      notify({ kind: 'ok', text: `${CHANNEL_LABELS[channel]} opened.` });
    } catch {
      const ok = await copyToClipboard(messageText.trim());
      notify({
        kind: ok ? 'warn' : 'err',
        text: ok ? 'Could not open the app, so the message was copied.' : 'Could not send or copy the message.',
      });
    } finally {
      setSendingChannel(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader
          title="Message sender"
          subtitle="Send customer links and strong service updates"
          onClose={onClose}
        />
        <View style={styles.body}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {notice ? <StatusBanner kind={notice.kind} message={notice.text} /> : null}

            <View style={styles.contactCard}>
              <View style={styles.contactHeader}>
                <View style={styles.contactTitleBlock}>
                  <Text style={styles.contactKicker}>Customer contact</Text>
                  <Text style={styles.contactTitle}>
                    {customerPhone ? 'Phone ready' : 'Add phone number'}
                  </Text>
                </View>
                <AppButton
                  label="Save"
                  variant="secondary"
                  onPress={saveContact}
                  disabled={!contactDirty}
                  style={styles.contactSaveButton}
                />
              </View>
              <View style={styles.contactGrid}>
                <View style={styles.contactField}>
                  <Text style={styles.contactLabel}>Phone number</Text>
                  <TextInput
                    value={phoneInput}
                    onChangeText={setPhoneInput}
                    placeholder="07... or +44..."
                    placeholderTextColor={colors.subtle}
                    keyboardType="phone-pad"
                    style={styles.contactInput}
                  />
                </View>
                <View style={styles.contactField}>
                  <Text style={styles.contactLabel}>Email</Text>
                  <TextInput
                    value={emailInput}
                    onChangeText={setEmailInput}
                    placeholder="customer@email.com"
                    placeholderTextColor={colors.subtle}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.contactInput}
                  />
                  {emailSuggestions.length > 0 ? (
                    <View style={styles.emailSuggestionRow}>
                      {emailSuggestions.map((email) => (
                        <Pressable
                          key={email}
                          onPress={() => setEmailInput(email)}
                          style={({ pressed }) => [
                            styles.emailSuggestionChip,
                            pressed && styles.emailSuggestionChipPressed,
                          ]}
                        >
                          <Text style={styles.emailSuggestionText} numberOfLines={1}>
                            {email}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
              <Text style={styles.contactHint}>
                The saved phone is used for WhatsApp, SMS, and new location links.
              </Text>
            </View>

            <View style={styles.linkStrip}>
              <LinkPill label="Location" ready={Boolean(draft.location.link)} />
              <LinkPill label="Payment" ready={Boolean(draft.paymentLink?.paymentUrl)} />
              <LinkPill label="Tracking" ready={Boolean(trackingUrl)} />
              <LinkPill label="Reference" ready={Boolean(draft.dispatchedRefNumber || draft.savedQuoteRef)} />
            </View>

            <View style={styles.templateGrid}>
              {templates.map((template) => {
                const active = template.id === selectedTemplate.id;
                return (
                  <Pressable
                    key={template.id}
                    onPress={() => setSelectedTemplateId(template.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: Boolean(template.disabledReason) }}
                    style={({ pressed }) => [
                      styles.templateCard,
                      active && styles.templateCardActive,
                      template.disabledReason && styles.templateCardDisabled,
                      pressed && !template.disabledReason && styles.templateCardPressed,
                    ]}
                  >
                    <Text style={styles.templateCategory}>{template.category}</Text>
                    <Text style={styles.templateTitle}>{template.title}</Text>
                    <Text style={styles.templateDescription}>{template.disabledReason ?? template.description}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.previewTitleBlock}>
                  <Text style={styles.previewKicker}>Preview</Text>
                  <Text style={styles.previewTitle}>{selectedTemplate.title}</Text>
                </View>
                {selectedTemplate.disabledReason ? (
                  <Text style={styles.previewWarning}>{selectedTemplate.disabledReason}</Text>
                ) : null}
              </View>

              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                multiline
                textAlignVertical="top"
                placeholder="Message text"
                placeholderTextColor={colors.subtle}
                style={styles.messageInput}
              />

              <View style={styles.channelRow}>
                {(['whatsapp', 'sms', 'email', 'copy'] as const).map((channel) => {
                  const active = selectedChannel === channel;
                  return (
                    <Pressable
                      key={channel}
                      onPress={() => setSelectedChannel(channel)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.channelButton,
                        active && styles.channelButtonActive,
                        pressed && styles.channelButtonPressed,
                      ]}
                    >
                      <Text style={[styles.channelText, active && styles.channelTextActive]}>
                        {CHANNEL_LABELS[channel]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {channelReason ? <Text style={styles.sendHint}>{channelReason}</Text> : null}
              {selectedTemplate.id === 'location_request' && !draft.location.link ? (
                <Text style={styles.sendHint}>
                  No location link yet. Press send and the app will create it first.
                </Text>
              ) : null}

              <View style={styles.actions}>
                <AppButton
                  label="Copy"
                  variant="secondary"
                  onPress={() => {
                    void copyToClipboard(messageText.trim()).then((ok) => {
                      notify({ kind: ok ? 'ok' : 'err', text: ok ? 'Message copied.' : 'Could not copy message.' });
                    });
                  }}
                  disabled={!messageText.trim() || internalBusy}
                  style={styles.actionButton}
                />
                <AppButton
                  label={`Send ${CHANNEL_LABELS[selectedChannel]}`}
                  variant="primary"
                  onPress={() => { void sendMessage(); }}
                  loading={internalBusy || externalBusy}
                  disabled={sendDisabled}
                  style={styles.actionButton}
                />
              </View>

              {externalBusy ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.busyText}>Preparing customer link...</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </AdminModalShell>
    </Modal>
  );
}

function LinkPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <View style={[styles.linkPill, ready && styles.linkPillReady]}>
      <Text style={[styles.linkPillText, ready && styles.linkPillTextReady]}>
        {label}: {ready ? 'ready' : 'missing'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    padding: space.md,
    gap: space.md,
    paddingBottom: space.xxl,
  },
  contactCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    padding: space.md,
    gap: space.md,
    ...senderPanelShadow,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  contactTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  contactKicker: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  contactTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginTop: 2,
  },
  contactSaveButton: {
    minWidth: 86,
  },
  contactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  contactField: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  contactLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginBottom: 6,
  },
  contactInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
  },
  contactHint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  emailSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  emailSuggestionChip: {
    maxWidth: '100%',
    minHeight: 32,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  emailSuggestionChipPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.ripple,
  },
  emailSuggestionText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  linkStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  linkPill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkPillReady: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  linkPillText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  linkPillTextReady: {
    color: colors.success,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  templateCard: {
    flexGrow: 1,
    flexBasis: 190,
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    padding: space.md,
    ...senderTemplateShadow,
  },
  templateCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  templateCardDisabled: {
    opacity: 0.58,
  },
  templateCardPressed: {
    backgroundColor: colors.panel,
  },
  templateCategory: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  templateTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    marginTop: 5,
  },
  templateDescription: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: 5,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    padding: space.md,
    gap: space.md,
    ...senderPanelShadow,
  },
  previewHeader: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  previewTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  previewKicker: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  previewTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginTop: 2,
  },
  previewWarning: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    maxWidth: 180,
    textAlign: 'right',
  },
  messageInput: {
    minHeight: 190,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    lineHeight: 21,
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  channelButton: {
    flexGrow: 1,
    flexBasis: 110,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  channelButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  channelButtonPressed: {
    opacity: 0.78,
  },
  channelText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  channelTextActive: {
    color: colors.accent,
  },
  sendHint: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 52,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  busyText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
