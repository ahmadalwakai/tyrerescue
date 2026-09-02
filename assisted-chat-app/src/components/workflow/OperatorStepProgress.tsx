import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';
import { useFadeSlideIn, useLoopingPulse, USE_NATIVE_DRIVER } from '../motion';
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

function StepChip({
  step,
  index,
  isActive,
  showConnector,
  onPress,
}: {
  step: OperatorWorkflowStep;
  index: number;
  isActive: boolean;
  showConnector: boolean;
  onPress: () => void;
}) {
  const tone = stepTone(step.status, isActive);
  const isComplete = step.status === 'complete';
  const [scale] = useState(() => new Animated.Value(isActive ? 1 : 0.92));
  const pulseOpacity = useLoopingPulse({ active: isActive, duration: 1600, min: 0.45, max: 1 });

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isActive ? 1 : 0.92,
      friction: 6,
      tension: 220,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [isActive, scale]);

  return (
    <View style={styles.stepWrap}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={onPress}
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
            <AppIcon
              name={isComplete ? 'check' : STEP_ICONS[step.id]}
              size={isComplete ? 16 : 18}
              color={tone.text}
            />
            {isActive ? (
              <Animated.View
                style={[styles.pulseRing, { borderColor: tone.border, opacity: pulseOpacity }]}
              />
            ) : null}
          </View>
          <Text style={[styles.label, { color: tone.text }]} numberOfLines={1}>
            {step.label}
          </Text>
          {isActive ? (
            <View style={[styles.activePip, { backgroundColor: colors.accent }]} />
          ) : null}
        </Pressable>
      </Animated.View>
      {showConnector ? (
        <View style={[styles.connectorWrap, styles.pointerNone]}>
          <View
            style={[
              styles.connectorLine,
              { backgroundColor: isComplete ? colors.success : tone.dot },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

export function OperatorStepProgress({
  steps,
  activeStepId,
  onStepPress,
}: OperatorStepProgressProps) {
  const entranceStyle = useFadeSlideIn({ distance: 6, duration: 220 });
  const scrollRef = useRef<ScrollView>(null);
  const layoutsRef = useRef<Map<string, number>>(new Map());
  const activeIndex = steps.findIndex((s) => s.id === activeStepId);
  const completedCount = steps.filter((s) => s.status === 'complete').length;

  useEffect(() => {
    const x = layoutsRef.current.get(activeStepId) ?? 0;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 20), animated: true });
  }, [activeStepId]);

  return (
    <Animated.View style={[styles.shell, entranceStyle]}>
      <View style={styles.railHeader}>
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>
            {activeIndex >= 0 ? `${activeIndex + 1} / ${steps.length}` : ''}
          </Text>
        </View>
        <Text style={styles.counterLabel} numberOfLines={1}>
          {steps[activeIndex]?.label ?? ''}
        </Text>
        {completedCount > 0 ? (
          <View style={styles.completedBadge}>
            <AppIcon name="check" size={10} color={colors.success} />
            <Text style={styles.completedText}>{completedCount} done</Text>
          </View>
        ) : null}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {steps.map((step, index) => (
          <View
            key={step.id}
            onLayout={(e) => {
              layoutsRef.current.set(step.id, e.nativeEvent.layout.x);
            }}
          >
            <StepChip
              step={step}
              index={index}
              isActive={step.id === activeStepId}
              showConnector={index < steps.length - 1}
              onPress={() => onStepPress(step.id)}
            />
          </View>
        ))}
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
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
  },
  counterBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.glowBorder,
  },
  counterText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  counterLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.successBg,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  completedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  row: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
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
    minHeight: 68,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textAlign: 'center',
  },
  activePip: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 4,
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
