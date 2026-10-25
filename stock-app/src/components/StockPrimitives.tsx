import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/theme';

type ButtonTone = 'primary' | 'default' | 'danger' | 'success';

export function Button({ title, onPress, disabled = false, tone = 'default', icon }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  const foreground = tone === 'primary' ? '#101820' : tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.text;
  const background = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.panelSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: background, borderColor: tone === 'primary' ? colors.primary : colors.border }, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.78 }]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={19} color={foreground} /> : null}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType = 'default', multiline = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        selectionColor={colors.primary}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

export function Message({ text, tone = 'info' }: { text: string; tone?: 'error' | 'success' | 'info' }) {
  const foreground = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.muted;
  const background = tone === 'error' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.panelSoft;
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.message, { backgroundColor: background }]}>
      <MaterialCommunityIcons name={tone === 'error' ? 'alert-circle-outline' : tone === 'success' ? 'check-circle-outline' : 'information-outline'} size={19} color={foreground} />
      <Text style={[styles.messageText, { color: foreground }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ title, description, onRetry, retryLabel = 'Try again' }: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {onRetry ? <Button title={retryLabel} onPress={onRetry} icon="refresh" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  field: { gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.bg, color: colors.text, fontSize: 16 },
  multiline: { minHeight: 96 },
  message: { padding: 12, borderRadius: radius.md, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  messageText: { flex: 1, fontSize: 14, lineHeight: 21 },
  empty: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'stretch', gap: 12 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
