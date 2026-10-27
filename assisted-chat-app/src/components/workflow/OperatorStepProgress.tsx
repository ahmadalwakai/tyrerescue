import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
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
  fg: string;
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

/** Below this column width a visible caption would be truncated ("Custo…"). */
const MIN_LABELLED_COLUMN_WIDTH = 56;

const STATUS_LABELS: Record<OperatorWorkflowStepStatus, string> = {
  not_started: 'Not started',
  active: 'In progress',
  waiting: 'Waiting',
  complete: 'Done',
  blocked: 'Blocked',
  error: 'Needs attention',
};

function stepTone(status: OperatorWorkflowStepStatus, isActive: boolean): StepTone {
  if (isActive) {
    return { border: colors.accent, surface: colors.accentSoft, fg: colors.accent };
  }
  switch (status) {
    case 'complete':
      return { border: colors.successBorder, surface: colors.successBg, fg: colors.success };
    case 'waiting':
      return { border: colors.infoBorder, surface: colors.infoBg, fg: colors.info };
    case 'blocked':
      return { border: colors.warningBorder, surface: colors.warningBg, fg: colors.warning };
    case 'error':
      return { border: colors.dangerBorder, surface: colors.dangerBg, fg: colors.danger };
    case 'active':
      return { border: colors.glowBorder, surface: colors.accentMuted, fg: colors.accent };
    default:
      return { border: colors.border, surface: colors.cardMuted, fg: colors.subtle };
  }
}

function nodeIcon(step: OperatorWorkflowStep): AppIconName {
  if (step.status === 'complete') return 'check';
  if (step.status === 'error') return 'exclamation';
  return STEP_ICONS[step.id];
}

/**
 * Compact stepper: every step fits the width at 360px (no hidden steps behind
 * a horizontal scroll). Each node reflects that step's own status, never its
 * position, and connectors are green only after a step that is actually done.
 * The active step's label, status and hint are spelled out above the rail.
 */
export function OperatorStepProgress({
  steps,
  activeStepId,
  onStepPress,
}: OperatorStepProgressProps) {
  const entranceStyle = useFadeSlideIn({ distance: 6, duration: 220 });
  const activeIndex = steps.findIndex((s) => s.id === activeStepId);
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;
  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const activeTone = activeStep ? stepTone(activeStep.status, true) : null;
  const [railWidth, setRailWidth] = useState(0);
  // On phones only the active step is captioned (its full label, status and
  // hint are also in the summary row); every node keeps its icon and a
  // complete accessibility label.
  const showAllLabels = railWidth > 0 && railWidth / Math.max(steps.length, 1) >= MIN_LABELLED_COLUMN_WIDTH;

  return (
    <Animated.View style={[styles.shell, entranceStyle]} testID="operator-step-progress">
      <View style={styles.summaryRow}>
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>
            {activeIndex >= 0 ? `${activeIndex + 1}/${steps.length}` : `${steps.length}`}
          </Text>
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.activeLabel} numberOfLines={1} accessibilityRole="header">
            {activeStep?.label ?? 'Workflow'}
          </Text>
          {activeStep?.hint ? (
            <Text style={styles.activeHint} numberOfLines={1}>{activeStep.hint}</Text>
          ) : null}
        </View>
        {activeStep && activeTone && activeStep.status !== 'active' && activeStep.status !== 'not_started' ? (
          <View style={[styles.statusPill, { borderColor: stepTone(activeStep.status, false).border }]}>
            <Text style={[styles.statusPillText, { color: stepTone(activeStep.status, false).fg }]} numberOfLines={1}>
              {STATUS_LABELS[activeStep.status]}
            </Text>
          </View>
        ) : null}
        <Text style={styles.doneText} numberOfLines={1}>{completedCount}/{steps.length} done</Text>
      </View>

      <View
        style={styles.rail}
        accessibilityRole="tablist"
        onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
      >
        {steps.map((step, index) => {
          const isActive = step.id === activeStepId;
          const tone = stepTone(step.status, isActive);
          const previousDone = index > 0 && steps[index - 1].status === 'complete';
          const thisDone = step.status === 'complete';
          return (
            <Pressable
              key={step.id}
              onPress={() => onStepPress(step.id)}
              android_ripple={{ color: colors.ripple, borderless: true }}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${index + 1} of ${steps.length}. ${step.label}. ${STATUS_LABELS[step.status]}.${step.hint ? ` ${step.hint}.` : ''}`}
              accessibilityState={{ selected: isActive }}
              // react-native-web does not map accessibilityState.selected for tabs.
              aria-selected={isActive}
              testID={`operator-step-${step.id}`}
              style={({ pressed }) => [styles.stepColumn, pressed && styles.stepPressed]}
            >
              <View style={styles.trackRow}>
                <View
                  style={[
                    styles.trackLine,
                    index === 0 && styles.trackHidden,
                    { backgroundColor: previousDone ? colors.successBorder : colors.border },
                  ]}
                />
                <View
                  style={[
                    styles.node,
                    isActive && styles.nodeActive,
                    { borderColor: tone.border, backgroundColor: tone.surface },
                  ]}
                >
                  <AppIcon name={nodeIcon(step)} size={isActive ? 15 : 13} color={tone.fg} />
                </View>
                <View
                  style={[
                    styles.trackLine,
                    index === steps.length - 1 && styles.trackHidden,
                    { backgroundColor: thisDone ? colors.successBorder : colors.border },
                  ]}
                />
              </View>
              {showAllLabels || isActive ? (
                <Text
                  style={[
                    styles.stepLabel,
                    { color: isActive ? colors.text : tone.fg },
                    isActive && styles.stepLabelActive,
                    isActive && !showAllLabels && styles.stepLabelOverflow,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    paddingHorizontal: space.xs,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 26px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)' } as ViewStyle)
      : ({
          shadowColor: colors.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        } as ViewStyle)),
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    marginBottom: space.xs,
  },
  counterBadge: {
    minWidth: 36,
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.glowBorder,
  },
  counterText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  activeLabel: {
    fontSize: fontSize.md,
    fontWeight: '900',
    color: colors.text,
  },
  activeHint: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  doneText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.subtle,
    flexShrink: 0,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepColumn: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
    minHeight: 52,
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 4,
  },
  stepPressed: {
    opacity: 0.72,
  },
  trackRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
  },
  trackLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  trackHidden: {
    opacity: 0,
  },
  node: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeActive: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
  },
  stepLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: '100%',
    paddingHorizontal: 1,
  },
  stepLabelActive: {
    fontWeight: '900',
  },
  // The active caption may be wider than its column on phones; let it
  // overflow sideways instead of truncating (neighbours have no caption).
  stepLabelOverflow: {
    maxWidth: undefined,
    width: 84,
  },
});
