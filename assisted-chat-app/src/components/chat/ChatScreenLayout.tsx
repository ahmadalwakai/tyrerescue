import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme';

/** A chat owns its safe area and keyboard once; dashboard decoration never sits behind messages. */
export function ChatScreenLayout({ title, subtitle, reference, onBack, onClose, children }: {
  title: string;
  subtitle?: string;
  reference?: string | null;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {onBack ? <HeaderAction label="Back" onPress={onBack} /> : null}
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <HeaderAction label="Close" onPress={onClose} />
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {reference ? <Text style={styles.reference} selectable>{reference}</Text> : null}
      </View>
      <KeyboardAvoidingView style={styles.body}
        behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function useChatBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return keyboardVisible ? space.sm : Math.max(insets.bottom, space.sm);
}

function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
    <Text style={styles.actionText}>{label === 'Back' ? '\u2039 Back' : label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  body: { flex: 1, minHeight: 0, backgroundColor: '#000000' },
  header: { flexShrink: 0, backgroundColor: '#000000', paddingHorizontal: space.md,
    paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  reference: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: '700',
    writingDirection: 'ltr', textAlign: 'left', marginTop: 3 },
  action: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, paddingHorizontal: space.sm },
  actionText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
