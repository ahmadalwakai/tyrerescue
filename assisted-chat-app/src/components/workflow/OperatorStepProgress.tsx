import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { useFadeSlideIn } from '../motion';
import type {
  OperatorWorkflowStep,
  OperatorWorkflowStepId,
  OperatorWorkflowStepStatus,
} from '@/types/operator-workflow';

export interface OperatorStepProgressProps {
  steps: OperatorWorkflowStep[];
  activeStepId: OperatorWorkflowStepId;
  onStepPress: (stepId: OperatorWorkflowStepId) => void;
}

interface ChipPalette {
  border: string;
  background: string;
  text: string;
  hint: string;
}

function chipPalette(status: OperatorWorkflowStepStatus, isActive: boolean): ChipPalette {
  if (isActive) {
    return {
      border: colors.accent,
      background: colors.ripple,
      text: colors.accent,
      hint: colors.text,
    };
  }
  switch (status) {
    case 'complete':
      return {
        border: colors.successBorder,
        background: colors.successBg,
        text: colors.success,
        hint: colors.muted,
      };
    case 'waiting':
      return {
        border: colors.infoBorder,
        background: colors.infoBg,
        text: colors.info,
        hint: colors.muted,
      };
    case 'blocked':
      return {
        border: colors.warningBorder,
        background: colors.warningBg,
        text: colors.warning,
        hint: colors.muted,
      };
    case 'error':
      return {
        border: colors.dangerBorder,
        background: colors.dangerBg,
        text: colors.danger,
        hint: colors.muted,
      };
    case 'active':
      return {
        border: colors.accent,
        background: colors.ripple,
        text: colors.accent,
        hint: colors.text,
      };
    default:
      return {
        border: colors.border,
        background: colors.bg,
        text: colors.muted,
        hint: colors.subtle,
      };
  }
}

/**
 * Horizontal-scroll workflow strip that doubles as a tap-to-jump nav. Used
 * directly under the screen header so the operator can always see (a) which
 * step they are on and (b) which steps are done / waiting / blocked.
 *
 * Designed for 360px-wide phones: chips have `flexShrink: 0` so they stay
 * readable instead of collapsing into a single character. The horizontal
 * ScrollView lets the full 7-step flow fit any screen width.
 */
export function OperatorStepProgress({
  steps,
  activeStepId,
  onStepPress,
}: OperatorStepProgressProps) {
  const entranceStyle = useFadeSlideIn({ distance: 6, duration: 220 });
  return (
    <Animated.View style={[styles.shell, entranceStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;
          const palette = chipPalette(step.status, isActive);
          const showHint = Boolean(
            step.hint && (isActive || step.status === 'waiting' || step.status === 'blocked' || step.status === 'error'),
          );
          return (
            <View key={step.id} style={styles.chipWrap}>
              <Pressable
                onPress={() => onStepPress(step.id)}
                android_ripple={{ color: colors.ripple }}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}. ${step.label}. Status: ${step.status.replace('_', ' ')}.`}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.background,
                  },
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={styles.index}>{index + 1}</Text>
                <View style={styles.chipText}>
                  <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
                    {step.label}
                  </Text>
                  {showHint ? (
                    <Text style={[styles.hint, { color: palette.hint }]} numberOfLines={1}>
                      {step.hint}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.cardMuted,
    paddingVertical: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  row: {
    paddingVertical: space.xs,
    paddingHorizontal: 8,
    gap: space.sm,
    alignItems: 'stretch',
  },
  chipWrap: {
    // flexShrink:0 so chips don't squish on narrow screens (360px target).
    flexShrink: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chipPressed: {
    opacity: 0.75,
  },
  index: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '900',
    minWidth: 18,
    minHeight: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceElevated,
    lineHeight: 18,
    textAlign: 'center',
  },
  chipText: {
    minWidth: 0,
    maxWidth: 130,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  hint: {
    fontSize: 10,
    marginTop: 0,
  },
});
