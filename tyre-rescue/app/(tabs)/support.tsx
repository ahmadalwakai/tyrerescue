import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PHONE_DISPLAY, PHONE_TEL, SMS_PHONE_TEL, SUPPORT_EMAIL, whatsappUrl } from '@/src/config';
import { colors, radii, spacing, typography } from '@/src/theme';
import { AppHeader, ListRow, PrimaryButton, ScreenHeader, useScreenContentInsets } from '@/src/ui';
import { CustomerCallbackRequest } from '@/src/customer-callback';

export default function SupportScreen() {
  const safeContentInsets = useScreenContentInsets();
  const router = useRouter();
  const [callbackOpen, setCallbackOpen] = useState(false);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, safeContentInsets]}>
      <AppHeader />
      <ScreenHeader title="How can we help?" detail="Our team covers Central Scotland. For anything urgent, call us." />

      <PrimaryButton icon="phone" accessibilityLabel={`Call Tyre Rescue on ${PHONE_DISPLAY}`} onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>
        {`Call ${PHONE_DISPLAY}`}
      </PrimaryButton>

      <View style={styles.list}>
        <ListRow icon="message-circle" title="Chat with us" detail="Message the team in the app" onPress={() => router.push('/(tabs)/chat')} />
        <ListRow icon="smartphone" title="WhatsApp" detail="Usually the quickest reply"
          onPress={() => Linking.openURL(whatsappUrl('Hi, I need help with my Tyre Rescue booking.'))} />
        <ListRow icon="phone-incoming" title="Request a callback" detail="Leave your number and we'll ring you" onPress={() => setCallbackOpen(value => !value)} />
        <ListRow icon="message-square" title="Send a text" detail={PHONE_DISPLAY} onPress={() => Linking.openURL(`sms:${SMS_PHONE_TEL}`)} />
        <ListRow icon="mail" title="Email" detail={SUPPORT_EMAIL} last
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Tyre Rescue support')}`)} />
      </View>

      {callbackOpen ? <CustomerCallbackRequest startOpen onCancel={() => setCallbackOpen(false)} /> : null}

      <View style={styles.notice}>
        <Feather accessible={false} name="shield" size={16} color={colors.subtle} />
        <Text style={styles.noticeText}>{"We only ask for your location while you're making a booking."}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: colors.bg,
  },
  content: {
    backgroundColor: colors.bg,
    gap: 20,
    minHeight: '100%',
    paddingHorizontal: spacing.page,
  },
  list: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  notice: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  noticeText: {
    color: colors.subtle,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
});
