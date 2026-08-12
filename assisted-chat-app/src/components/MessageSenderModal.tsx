import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LocationShareContactOverride, LocationShareMethod } from '@/hooks/useAssistedChatLocationShare';
import { api } from '@/lib/api';
import { normalizeContactPhone, normalizeUkMobilePhoneNumber } from '@/lib/money';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

const DEFAULT_MESSAGE = 'Hi there, this is Tyre Rescue.';

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

export function MessageSenderModal({
  visible,
  draft,
  onClose,
  onSaveCustomerContact,
  onNotice,
}: MessageSenderModalProps) {
  const [phoneInput, setPhoneInput] = useState(draft.customer.phone);
  const [messageText, setMessageText] = useState(DEFAULT_MESSAGE);
  const [notice, setNotice] = useState<MessageNotice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPhoneInput(draft.customer.phone);
    setMessageText(DEFAULT_MESSAGE);
    setNotice(null);
    setBusy(false);
  }, [draft.customer.phone, visible]);

  const notify = (next: MessageNotice) => {
    setNotice(next);
    onNotice?.(next);
  };

  const customerPhone = normalizeContactPhone(phoneInput);
  const smsPhone = normalizeUkMobilePhoneNumber(phoneInput);
  const cleanMessage = messageText.trim();
  const canSend = Boolean(smsPhone && cleanMessage && !busy);

  const sendSms = async () => {
    if (!smsPhone) {
      notify({ kind: 'err', text: 'Enter a valid UK mobile number.' });
      return;
    }
    if (!cleanMessage) {
      notify({ kind: 'err', text: 'Enter a message first.' });
      return;
    }

    setBusy(true);
    try {
      onSaveCustomerContact({ phone: customerPhone, email: draft.customer.email.trim() });
      await api.post('/api/mobile/admin/sms', { to: customerPhone, message: cleanMessage });
      notify({ kind: 'ok', text: 'SMS sent.' });
    } catch (error) {
      notify({ kind: 'err', text: error instanceof Error ? error.message : 'Could not send SMS.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader title="Message sender" subtitle="SMS phone number and text" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {notice ? <StatusBanner kind={notice.kind} message={notice.text} /> : null}

          <View style={styles.card}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="07... or +44..."
                placeholderTextColor={colors.subtle}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Message</Text>
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder={DEFAULT_MESSAGE}
                placeholderTextColor={colors.subtle}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.messageInput]}
              />
            </View>

            <View style={styles.actions}>
              <AppButton
                label="Send"
                variant="primary"
                onPress={() => { void sendSms(); }}
                loading={busy}
                disabled={!canSend}
                style={styles.actionButton}
              />
            </View>
          </View>
        </ScrollView>
      </AdminModalShell>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    padding: space.md,
    gap: space.md,
  },
  fieldBlock: {
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  messageInput: {
    minHeight: 190,
    lineHeight: 22,
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
});
