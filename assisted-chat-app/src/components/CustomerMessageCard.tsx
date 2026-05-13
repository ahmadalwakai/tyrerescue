import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, SectionCard, StatusBanner } from './ui';
import { colors, fontSize } from './theme';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';

interface Props {
  /** Pre-built message body. Caller decides templating. */
  message: string;
  /** Customer phone, used for the WhatsApp button. May be empty. */
  customerPhone: string;
}

/**
 * Small dark card the operator can use to send the current customer message
 * via WhatsApp or copy it to clipboard. SMS is intentionally not exposed
 * here because the app sends chat text through WhatsApp or clipboard only.
 */
export function CustomerMessageCard({ message, customerPhone }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [waError, setWaError] = useState<string | null>(null);

  const handleCopy = async () => {
    const ok = await copyToClipboard(message);
    setCopyState(ok ? 'ok' : 'err');
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleWhatsApp = async () => {
    setWaError(null);
    const url = buildWhatsAppUrl(customerPhone, message);
    if (!url) {
      setWaError('Add customer phone first.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setWaError('Could not open WhatsApp.');
    }
  };

  return (
    <SectionCard title="Customer message">
      <View style={styles.previewBox}>
        <Text style={styles.previewText}>{message}</Text>
      </View>
      <View style={styles.actions}>
        <AppButton label="Copy message" variant="secondary" onPress={handleCopy} fullWidth />
        <AppButton label="Send WhatsApp" variant="primary" onPress={handleWhatsApp} fullWidth />
      </View>
      {copyState === 'ok' ? (
        <View style={{ marginTop: 8 }}>
          <StatusBanner kind="ok" message="Message copied to clipboard." />
        </View>
      ) : null}
      {copyState === 'err' ? (
        <View style={{ marginTop: 8 }}>
          <StatusBanner kind="err" message="Could not copy message." />
        </View>
      ) : null}
      {waError ? (
        <View style={{ marginTop: 8 }}>
          <StatusBanner kind="err" message={waError} />
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  previewBox: {
    marginTop: 4,
    padding: 10,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  previewText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  actions: { gap: 8, marginTop: 10 },
});
