import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../ui/ActionButton';
import { colors, fontSize, radius, space } from '../theme';

export interface WorkingStatusCardProps {
  title: string;
  body: string;
  /** Last time the system polled / refreshed. Renders as `Last checked Xs ago`. */
  checkedAt?: Date | string | null;
  loading?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
}

function formatCheckedAt(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `Last checked ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `Last checked ${minutes}m ago`;
}

/**
 * Visible "the system is doing work" card. Used during polling, payment
 * waiting, and dispatch waiting so the operator never wonders if the app
 * is frozen. The optional `actionLabel` lets the operator escape (resend
 * link, retry, cancel) without leaving the section.
 */
export function WorkingStatusCard({
  title,
  body,
  checkedAt,
  loading = false,
  actionLabel,
  onActionPress,
}: WorkingStatusCardProps) {
  const checked = formatCheckedAt(checkedAt);
  const showAction = Boolean(actionLabel && onActionPress);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {loading ? <ActivityIndicator color={colors.info} /> : <View style={styles.dot} />}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {checked ? <Text style={styles.checked}>{checked}</Text> : null}
      {showAction ? (
        <View style={styles.action}>
          <ActionButton
            label={actionLabel ?? ''}
            onPress={onActionPress ?? (() => undefined)}
            variant="secondary"
            size="md"
            fullWidth
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.info,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.info,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  checked: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  action: {
    marginTop: 4,
  },
});
