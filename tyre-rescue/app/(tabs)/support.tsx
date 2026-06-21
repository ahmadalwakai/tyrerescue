import { Feather } from '@expo/vector-icons';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PHONE_DISPLAY, PHONE_TEL, SUPPORT_EMAIL, whatsappUrl } from '@/src/config';
import { colors, spacing, typography } from '@/src/theme';
import { Card, Logo, PrimaryButton, Row, ScreenHeader } from '@/src/ui';

export default function SupportScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Logo />
      <ScreenHeader eyebrow="Help" title="Contact Tyre Rescue" detail="For urgent changes, call the team directly." />
      <Card>
        <Row label="Phone" value={PHONE_DISPLAY} valueStyle={{ color: colors.accent }} />
        <Row label="Email" value={SUPPORT_EMAIL} valueStyle={{ color: colors.accent }} />
        <Row label="Coverage" value="Central Scotland" />
      </Card>
      <PrimaryButton icon="phone" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>
        Call Tyre Rescue
      </PrimaryButton>
      <PrimaryButton
        icon="message-circle"
        variant="secondary"
        onPress={() => Linking.openURL(whatsappUrl('Hi, I need help with my Tyre Rescue booking.'))}
      >
        WhatsApp Support
      </PrimaryButton>
      <PrimaryButton icon="message-circle" variant="secondary" onPress={() => Linking.openURL(`sms:${PHONE_TEL}`)}>
        Send SMS
      </PrimaryButton>
      <PrimaryButton
        icon="mail"
        variant="secondary"
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Tyre Rescue support')}`)}
      >
        Email support
      </PrimaryButton>
      <View style={styles.notice}>
        <Feather name="map-pin" size={18} color={colors.accent} />
        <Text style={styles.noticeText}>Location access is only requested while creating a booking.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.bg,
    gap: 16,
    minHeight: '100%',
    padding: spacing.page,
    paddingBottom: 42,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  noticeText: {
    color: colors.muted,
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
