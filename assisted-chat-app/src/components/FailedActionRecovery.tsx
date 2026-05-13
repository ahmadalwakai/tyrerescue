import { StyleSheet, Text, View } from 'react-native';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

/**
 * Reusable inline recovery panel shown next to a failing action. Renders
 * nothing when there's no error so callers can hand it the same value
 * unconditionally. Buttons shown depend on what the caller can offer.
 */

export interface RecoveryAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface Props {
  message: string | null;
  /** Headline shown above the message, e.g. "Booking could not be sent to driver." */
  title?: string;
  actions?: RecoveryAction[];
}

export function FailedActionRecovery({ message, title, actions }: Props) {
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <StatusBanner kind="err" message={message} />
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <AppButton
              key={a.label}
              label={a.label}
              variant={a.variant ?? 'secondary'}
              onPress={a.onPress}
              fullWidth
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    padding: 10,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    gap: 8,
  },
  title: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  actions: { gap: 6 },
});
