import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { useFadeSlideIn } from '../motion';
import { AppIcon, type AppIconName } from '../icons/AppIcon';
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

interface StepTone {
  border: string;
  surface: string;
  text: string;
  muted: string;
  dot: string;
}

const STEP_ICONS: Record<OperatorWorkflowStepId, AppIconName> = {
  customer: 'user',
  location: 'map-marker',
  tyre: 'life-ring',
  lockingNut: 'lock',
  quote: 'file-text-o',
  payment: 'credit-card',
  dispatch: 'truck',
};

function stepTone(status: OperatorWorkflowStepStatus, isActive: boolean): StepTone {
  if (isActive) {
    return {
      border: colors.glowBorder,
      surface: colors.accentMuted,
      text: colors.accent,
      muted: colors.text,
      dot: colors.accent,
    };
  }

  switch (status) {
    case 'complete':
      return {
        border: colors.successBorder,
        surface: colors.successBg,
        text: colors.success,
        muted: colors.muted,
        dot: colors.success,
      };
    case 'waiting':
      return {
        border: colors.infoBorder,
        surface: colors.infoBg,
        text: colors.info,
        muted: colors.muted,
        dot: colors.info,
      };
    case 'blocked':
      return {
        border: colors.warningBorder,
        surface: colors.warningBg,
        text: colors.warning,
        muted: colors.muted,
        dot: colors.warning,
      };
    case 'error':
      return {
        border: colors.dangerBorder,
        surface: colors.dangerBg,
        text: colors.danger,
        muted: colors.muted,
        dot: colors.danger,
      };
    case 'active':
      return {
        border: colors.glowBorder,
        surface: colors.accentMuted,
        text: colors.accent,
        muted: colors.text,
        dot: colors.accent,
      };
    default:
      return {
        border: colors.border,
        surface: colors.cardMuted,
        text: colors.muted,
        muted: colors.subtle,
        dot: colors.borderStrong,
      };
  }
}

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
        snapToAlignment="start"
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;
          const tone = stepTone(step.status, isActive);
          const showConnector = index < steps.length - 1;
          return (
            <View key={step.id} style={styles.stepWrap}>
              <Pressable
                onPress={() => onStepPress(step.id)}
                android_ripple={{ color: colors.ripple }}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}. ${step.label}. Status: ${step.status.replace('_', ' ')}.`}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.stepNode,
                  {
                    borderColor: tone.border,
                    backgroundColor: tone.surface,
                  },
                  isActive && styles.stepNodeActive,
                  pressed && styles.stepNodePressed,
                ]}
              >
                <View style={[styles.iconOrb, { borderColor: tone.border, backgroundColor: colors.bgDeep }]}>
                  <AppIcon name={STEP_ICONS[step.id]} size={20} color={tone.text} />
                </View>
                <Text style={[styles.label, { color: tone.text }]} numberOfLines={1}>
                  {step.label}
                </Text>
                {isActive ? <Text style={styles.currentHint} numberOfLines={1}>Current</Text> : null}
              </Pressable>
              {showConnector ? (
                <View style={[styles.connectorWrap, styles.pointerNone]}>
                  <View style={[styles.connectorLine, { backgroundColor: tone.dot }]} />
                </View>
              ) : null}
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
    borderRadius: 18,
    backgroundColor: 'rgba(13,20,39,0.82)',
    paddingVertical: 6,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 14px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)' } as ViewStyle)
      : ({
          shadowColor: colors.shadow,
          shadowOpacity: 0.26,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 9 },
          elevation: 4,
        } as ViewStyle)),
  },
  row: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  pointerNone: { pointerEvents: 'none' },
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepNode: {
    minWidth: 78,
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNodeActive: {
    minWidth: 90,
  },
  stepNodePressed: {
    opacity: 0.78,
  },
  iconOrb: {
    width: 32,
    height: 32,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textAlign: 'center',
  },
  currentHint: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  connectorWrap: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorLine: {
    width: 14,
    height: 2,
    borderRadius: 2,
    opacity: 0.74,
  },
});
