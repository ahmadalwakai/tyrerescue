import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/ui/theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'neutral';
}

export function PrimaryButton({ title, onPress, disabled, tone = 'primary' }: Props) {
  const backgroundColor =
    tone === 'danger' ? colors.danger : tone === 'neutral' ? '#324A5F' : colors.primary;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
