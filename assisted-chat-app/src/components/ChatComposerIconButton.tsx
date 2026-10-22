import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from './theme';

type ComposerIconName = keyof typeof Ionicons.glyphMap;

export function ChatComposerIconButton({
  icon,
  label,
  onPress,
  disabled,
  loading,
  tone = 'secondary',
}: {
  icon: ComposerIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'secondary' | 'primary' | 'danger';
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.primary,
        tone === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Ionicons
          name={icon}
          size={20}
          color={tone === 'primary' ? colors.accentText : tone === 'danger' ? colors.danger : colors.text}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    borderColor: colors.accentHover,
    backgroundColor: colors.accent,
  },
  danger: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.74 },
});
