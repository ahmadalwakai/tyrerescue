import { Animated, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../ui/ActionButton';
import { colors, fontSize, radius, space } from '../theme';
import { useFadeSlideIn } from '../motion';
import type { NextBestActionStatus } from '@/types/operator-workflow';

export interface NextBestActionCardProps {
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  status?: NextBestActionStatus;
}

interface CardPalette {
  background: string;
  border: string;
  title: string;
  body: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  pillLabel: string;
}

function paletteForStatus(status: NextBestActionStatus): CardPalette {
  switch (status) {
    case 'success':
      return {
        background: colors.successBg,
        border: colors.successBorder,
        title: colors.success,
        body: colors.text,
        pillBg: colors.surface,
        pillBorder: colors.successBorder,
        pillText: colors.success,
        pillLabel: 'Success',
      };
    case 'waiting':
      return {
        background: colors.infoBg,
        border: colors.infoBorder,
        title: colors.info,
        body: colors.text,
        pillBg: colors.surface,
        pillBorder: colors.infoBorder,
        pillText: colors.info,
        pillLabel: 'Waiting',
      };
    case 'warning':
      return {
        background: colors.warningBg,
        border: colors.warningBorder,
        title: colors.warning,
        body: colors.text,
        pillBg: colors.surface,
        pillBorder: colors.warningBorder,
        pillText: colors.warning,
        pillLabel: 'Action needed',
      };
    case 'error':
      return {
        background: colors.dangerBg,
        border: colors.dangerBorder,
        title: colors.danger,
        body: colors.text,
        pillBg: colors.surface,
        pillBorder: colors.dangerBorder,
        pillText: colors.danger,
        pillLabel: 'Needs fix',
      };
    default:
      return {
        background: colors.surface,
        border: colors.border,
        title: colors.text,
        body: colors.muted,
        pillBg: colors.card,
        pillBorder: colors.border,
        pillText: colors.muted,
        pillLabel: 'Next step',
      };
  }
}

/**
 * Tells the operator, in plain English, what to do next. Sits near the top
 * of the screen so it is the first thing the eye lands on. The status pill
 * mirrors the colour of the underlying state (info/waiting/success/warning/
 * error) so the meaning is obvious before reading any text.
 */
export function NextBestActionCard({
  title,
  body,
  primaryLabel,
  onPrimaryPress,
  loading = false,
  disabled = false,
  disabledReason,
  status = 'info',
}: NextBestActionCardProps) {
  const palette = paletteForStatus(status);
  const showButton = Boolean(primaryLabel && onPrimaryPress);
  const entranceStyle = useFadeSlideIn({ distance: 8, duration: 240 });

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: palette.background, borderColor: palette.border },
        entranceStyle,
      ]}
    >
      <View pointerEvents="none" style={[styles.accentLine, { backgroundColor: palette.title }]} />
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: palette.title }]} />
        <Text style={[styles.title, { color: palette.title }]} numberOfLines={2}>
          {title}
        </Text>
        <View
          style={[
            styles.pill,
            { backgroundColor: palette.pillBg, borderColor: palette.pillBorder },
          ]}
        >
          <Text style={[styles.pillText, { color: palette.pillText }]}>
            {palette.pillLabel}
          </Text>
        </View>
      </View>
      <Text style={[styles.body, { color: palette.body }]}>{body}</Text>
      {showButton ? (
        <View style={styles.action}>
          <ActionButton
            label={primaryLabel ?? ''}
            onPress={onPrimaryPress ?? (() => undefined)}
            loading={loading}
            disabled={disabled}
            disabledReason={disabledReason}
            variant={status === 'error' ? 'danger' : status === 'success' ? 'success' : 'primary'}
            size="md"
            fullWidth
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  accentLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    opacity: 0.95,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    shadowColor: colors.shadowWarm,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  pill: {
    minHeight: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  action: {
    marginTop: 4,
  },
});
